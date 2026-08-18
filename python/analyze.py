#!/usr/bin/env python3
"""Bread Research Analyzer Version 10 - Python/OpenCV analysis engine.

Compatible with Python 3.6.8, NumPy 1.19.5 and OpenCV 4.5.5.
The script writes image files and returns exactly one JSON object on stdout.
"""
from __future__ import print_function

import argparse
import json
import math
import os
import platform
import sys
import traceback

import cv2
import numpy as np


ALGORITHM_VERSION = "10.6.0-python"


def as_bool(parameters, key, default=False):
    value = parameters.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).lower() in ("1", "true", "yes", "on")


def as_float(parameters, key, default=0.0):
    try:
        return float(parameters.get(key, default))
    except (TypeError, ValueError):
        return float(default)


def as_int(parameters, key, default=0):
    try:
        return int(float(parameters.get(key, default)))
    except (TypeError, ValueError):
        return int(default)


def odd(value, minimum=1):
    number = max(minimum, int(value))
    return number if number % 2 == 1 else number + 1


def write_image(directory, filename, image):
    if not os.path.isdir(directory):
        os.makedirs(directory)
    path = os.path.join(directory, filename)
    if not cv2.imwrite(path, image):
        raise RuntimeError("画像を書き出せません: " + path)
    return filename


def diagnostic_result():
    return {
        "ok": True,
        "mode": "diagnostic",
        "python_version": platform.python_version(),
        "opencv_version": cv2.__version__,
        "numpy_version": np.__version__,
        "algorithm_version": ALGORITHM_VERSION,
    }


def largest_filled_component(binary):
    contours_result = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = contours_result[0] if len(contours_result) == 2 else contours_result[1]
    if not contours:
        return np.zeros_like(binary, dtype=np.uint8)
    contour = max(contours, key=cv2.contourArea)
    result = np.zeros_like(binary, dtype=np.uint8)
    cv2.drawContours(result, [contour], -1, 255, cv2.FILLED)
    return result


def detect_bread_mask(source, parameters):
    height, width = source.shape[:2]
    if min(width, height) < 20:
        raise RuntimeError("パン輪郭を検出するには画像が小さすぎます。")
    margin = max(2, int(round(min(width, height) * 0.02)))
    rectangle = (margin, margin, max(1, width - margin * 2), max(1, height - margin * 2))
    grabcut_mask = np.zeros((height, width), dtype=np.uint8)
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            source,
            grabcut_mask,
            rectangle,
            background_model,
            foreground_model,
            max(1, as_int(parameters, "bread_grabcut_iterations", 5)),
            cv2.GC_INIT_WITH_RECT,
        )
        candidate = np.where(
            (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD), 255, 0
        ).astype(np.uint8)
        candidate = largest_filled_component(candidate)
    except cv2.error:
        candidate = np.zeros((height, width), dtype=np.uint8)

    fraction = float(cv2.countNonZero(candidate)) / float(width * height)
    if fraction < 0.03 or fraction > 0.95:
        gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (9, 9), 0)
        unused, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        candidate = largest_filled_component(threshold)

    smooth_size = odd(as_int(parameters, "bread_mask_smooth", 15), 3)
    smooth_size = min(smooth_size, 51)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (smooth_size, smooth_size))
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, kernel)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_OPEN, kernel)
    candidate = largest_filled_component(candidate)
    fraction = float(cv2.countNonZero(candidate)) / float(width * height)
    if fraction < 0.03 or fraction > 0.95:
        raise RuntimeError("パン輪郭を安定して検出できません。背景との明暗差または撮影範囲を確認してください。")
    return candidate


def analyze(input_path, output_dir, intermediate_dir, prefix, parameters, measurement_mask_path=None):
    source = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError("解析画像を読み込めません。")
    height, width = source.shape[:2]
    if width < 2 or height < 2:
        raise RuntimeError("解析画像が小さすぎます。")

    analysis_scope = str(parameters.get("analysis_scope", "rectangle"))
    if measurement_mask_path:
        measurement_mask = cv2.imread(measurement_mask_path, cv2.IMREAD_GRAYSCALE)
        if measurement_mask is None:
            raise RuntimeError("保存されたパン輪郭マスクを読み込めません。")
        if measurement_mask.shape[:2] != (height, width):
            raise RuntimeError("パン輪郭マスクと解析画像のサイズが一致しません。輪郭を再検出してください。")
        unused, measurement_mask = cv2.threshold(measurement_mask, 127, 255, cv2.THRESH_BINARY)
        measurement_mask = largest_filled_component(measurement_mask)
    elif analysis_scope == "bread":
        measurement_mask = detect_bread_mask(source, parameters)
    else:
        measurement_mask = np.full((height, width), 255, dtype=np.uint8)

    if analysis_scope == "bread":
        measurement_fraction = float(cv2.countNonZero(measurement_mask)) / float(width * height)
        if measurement_fraction < 0.01 or measurement_fraction > 0.98:
            raise RuntimeError("パン輪郭の面積が不正です。輪郭を再検出または手動修正してください。")

    gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    if as_bool(parameters, "use_clahe", True):
        tile_count = max(1, as_int(parameters, "clahe_tiles", 8))
        clahe = cv2.createCLAHE(
            clipLimit=max(0.1, as_float(parameters, "clahe_clip", 2.0)),
            tileGridSize=(tile_count, tile_count),
        )
        enhanced = clahe.apply(gray)
    else:
        enhanced = gray.copy()

    blur_size = odd(as_int(parameters, "blur_size", 5), 1)
    blurred = cv2.GaussianBlur(enhanced, (blur_size, blur_size), 0)

    dpi = max(1.0, as_float(parameters, "dpi", 300.0))
    scale = max(0.000001, as_float(parameters, "scale", 1.0))
    millimeters_per_pixel = (25.4 / dpi) / scale
    pixel_area_to_mm2 = millimeters_per_pixel * millimeters_per_pixel

    # Adaptive thresholding can miss broad pores whose centers have only a small
    # brightness difference from the crumb. A large black-hat filter estimates
    # the local crumb background and restores those dark, low-frequency pores.
    large_hole_mask = np.zeros_like(gray, dtype=np.uint8)
    large_hole_contrast = np.zeros_like(gray, dtype=np.uint8)
    if as_bool(parameters, "use_large_hole_rescue", True):
        rescue_window = odd(as_int(parameters, "large_hole_window", 61), 9)
        rescue_window = min(rescue_window, odd(max(9, min(width, height) - 2), 9))
        rescue_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (rescue_window, rescue_window)
        )
        # CLAHE emphasizes fine crumb texture and can connect the whole ROI.
        # Use a lightly smoothed original grayscale image for broad-pore rescue.
        rescue_source = cv2.GaussianBlur(gray, (7, 7), 0)
        large_hole_contrast = cv2.morphologyEx(
            rescue_source, cv2.MORPH_BLACKHAT, rescue_kernel
        )
        unused, rescue_binary = cv2.threshold(
            large_hole_contrast,
            max(1.0, as_float(parameters, "large_hole_contrast", 8.0)),
            255,
            cv2.THRESH_BINARY,
        )
        rescue_binary = cv2.morphologyEx(
            rescue_binary,
            cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        )
        rescue_binary = cv2.morphologyEx(
            rescue_binary,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        )
        rescue_contours_result = cv2.findContours(
            rescue_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        rescue_contours = (
            rescue_contours_result[0]
            if len(rescue_contours_result) == 2
            else rescue_contours_result[1]
        )
        rescue_minimum_mm2 = max(
            0.0, as_float(parameters, "large_hole_min_area_mm2", 2.0)
        )
        rescue_maximum_fraction = min(
            0.25,
            max(0.001, as_float(parameters, "large_hole_max_fraction", 0.05)),
        )
        rescue_border = max(1, as_int(parameters, "border_margin", 3))
        image_area_px = float(width * height)
        for rescue_contour in rescue_contours:
            rescue_area_px = float(cv2.contourArea(rescue_contour))
            rescue_area_mm2 = rescue_area_px * pixel_area_to_mm2
            x, y, rescue_width, rescue_height = cv2.boundingRect(rescue_contour)
            touches_border = (
                x <= rescue_border
                or y <= rescue_border
                or x + rescue_width >= width - rescue_border
                or y + rescue_height >= height - rescue_border
            )
            area_fraction = rescue_area_px / image_area_px
            box_fraction = float(rescue_width * rescue_height) / image_area_px
            # Reject crust/shadow networks and the failure mode where the whole
            # ROI becomes one red contour. A real pore occupies only a small
            # part of the measurement ROI and normally does not touch its edge.
            if (
                rescue_area_mm2 < rescue_minimum_mm2
                or area_fraction > rescue_maximum_fraction
                or box_fraction > rescue_maximum_fraction * 3.0
                or touches_border
            ):
                continue
            cv2.drawContours(
                large_hole_mask, [rescue_contour], -1, 255, cv2.FILLED
            )
    threshold_mode = str(parameters.get("threshold_mode", "adaptive"))
    if threshold_mode == "otsu":
        unused, binary = cv2.threshold(
            blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU
        )
    else:
        block_size = odd(as_int(parameters, "adaptive_block", 41), 3)
        binary = cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            as_float(parameters, "adaptive_c", 5.0),
        )
        if threshold_mode == "combined":
            unused, fixed = cv2.threshold(
                blurred,
                as_float(parameters, "hole_threshold", 145),
                255,
                cv2.THRESH_BINARY_INV,
            )
            binary = cv2.bitwise_or(binary, fixed)

    morphology = binary.copy()
    open_size = as_int(parameters, "open_size", 1)
    if open_size > 0:
        size = odd(open_size, 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
        morphology = cv2.morphologyEx(morphology, cv2.MORPH_OPEN, kernel)
    close_size = as_int(parameters, "close_size", 3)
    if close_size > 0:
        size = odd(close_size, 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
        morphology = cv2.morphologyEx(morphology, cv2.MORPH_CLOSE, kernel)

    border_margin = max(0, as_int(parameters, "border_margin", 3))
    analysis_domain = measurement_mask.copy()
    if border_margin > 0:
        erosion_size = border_margin * 2 + 1
        erosion_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erosion_size, erosion_size))
        analysis_domain = cv2.erode(analysis_domain, erosion_kernel)
    morphology = cv2.bitwise_and(morphology, analysis_domain)

    # Version 10.6: quantify the raw binarized image itself, separately from
    # contour filtering / Watershed. White pixels are pore candidates and
    # black pixels are crumb surface. Only the measurement mask is counted,
    # so the background outside a manually corrected bread contour is ignored.
    binary_measurement = cv2.bitwise_and(binary, measurement_mask)
    binary_domain_pixels = int(cv2.countNonZero(measurement_mask))
    binary_white_pixels = int(cv2.countNonZero(binary_measurement))
    binary_black_pixels = max(0, binary_domain_pixels - binary_white_pixels)
    binary_white_area_mm2 = binary_white_pixels * pixel_area_to_mm2
    binary_black_area_mm2 = binary_black_pixels * pixel_area_to_mm2
    binary_white_percent = (
        float(binary_white_pixels) / float(binary_domain_pixels) * 100.0
        if binary_domain_pixels else 0.0
    )
    binary_black_percent = (
        float(binary_black_pixels) / float(binary_domain_pixels) * 100.0
        if binary_domain_pixels else 0.0
    )
    # Gray indicates pixels outside the measurement range. This makes the
    # intermediate image visually match the pixels used for the area totals.
    binary_area_view = np.full_like(gray, 127, dtype=np.uint8)
    inside_measurement = measurement_mask > 0
    binary_area_view[inside_measurement] = 0
    binary_area_view[inside_measurement & (binary > 0)] = 255

    final_mask = morphology.copy()
    distance = np.zeros_like(gray, dtype=np.float32)
    watershed_view = source.copy()
    if as_bool(parameters, "use_distance", True):
        distance = cv2.distanceTransform(morphology, cv2.DIST_L2, 5)
        maximum = float(distance.max())
        ratio = min(1.0, max(0.0, as_float(parameters, "distance_ratio", 0.35)))
        if maximum > 0:
            unused, sure_foreground = cv2.threshold(distance, ratio * maximum, 255, cv2.THRESH_BINARY)
            sure_foreground = np.uint8(sure_foreground)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            sure_background = cv2.dilate(
                morphology,
                kernel,
                iterations=max(1, as_int(parameters, "background_dilate", 3)),
            )
            unknown = cv2.subtract(sure_background, sure_foreground)
            if as_bool(parameters, "use_watershed", True):
                component_count, markers = cv2.connectedComponents(sure_foreground, connectivity=8)
                markers = markers + 1
                markers[unknown == 255] = 0
                cv2.watershed(source.copy(), markers)
                final_mask = np.zeros_like(gray, dtype=np.uint8)
                final_mask[markers > 1] = 255
                watershed_view[markers == -1] = (0, 0, 255)
            else:
                final_mask = sure_foreground

    # Preserve the full shape of rescued broad pores after Watershed.
    if as_bool(parameters, "use_large_hole_rescue", True):
        large_hole_mask = cv2.bitwise_and(large_hole_mask, analysis_domain)
        final_mask = cv2.bitwise_or(final_mask, large_hole_mask)

    final_mask = cv2.bitwise_and(final_mask, analysis_domain)
    if border_margin > 0 and analysis_scope != "bread":
        border_margin = min(border_margin, max(1, min(width, height) // 2))
        cv2.rectangle(final_mask, (0, 0), (width - 1, height - 1), 0, border_margin)

    contours_result = cv2.findContours(final_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = contours_result[0] if len(contours_result) == 2 else contours_result[1]
    bread_area_mm2 = cv2.countNonZero(measurement_mask) * pixel_area_to_mm2
    minimum_area = max(0.0, as_float(parameters, "min_area_mm2", 0.15))
    maximum_area = max(0.0, as_float(parameters, "max_area_mm2", 0.0))
    minimum_circularity = max(0.0, as_float(parameters, "min_circularity", 0.0))
    maximum_aspect = max(1.0, as_float(parameters, "max_aspect_ratio", 20.0))
    small_limit = max(0.0, as_float(parameters, "small_limit_mm", 2.0))
    medium_limit = max(small_limit, as_float(parameters, "medium_limit_mm", 4.0))

    holes = []
    accepted = []
    total_hole_area = 0.0
    for contour in contours:
        area_px = float(cv2.contourArea(contour))
        area_mm2 = area_px * pixel_area_to_mm2
        if area_mm2 < minimum_area or (maximum_area > 0 and area_mm2 > maximum_area):
            continue
        perimeter_px = float(cv2.arcLength(contour, True))
        circularity = 4.0 * math.pi * area_px / (perimeter_px * perimeter_px) if perimeter_px > 0 else 0.0
        x, y, box_width, box_height = cv2.boundingRect(contour)
        width_mm = box_width * millimeters_per_pixel
        height_mm = box_height * millimeters_per_pixel
        aspect_ratio = max(width_mm, height_mm) / max(0.000001, min(width_mm, height_mm))
        if circularity < minimum_circularity or aspect_ratio > maximum_aspect:
            continue
        equivalent_diameter = 2.0 * math.sqrt(area_mm2 / math.pi)
        size_class = "小" if equivalent_diameter < small_limit else ("中" if equivalent_diameter < medium_limit else "大")
        moments = cv2.moments(contour)
        if moments["m00"]:
            center_x = int(round(moments["m10"] / moments["m00"]))
            center_y = int(round(moments["m01"] / moments["m00"]))
        else:
            center_x = int(round(x + box_width / 2.0))
            center_y = int(round(y + box_height / 2.0))
        number = len(holes) + 1
        holes.append({
            "hole_number": number,
            "area_mm2": area_mm2,
            "eq_diameter_mm": equivalent_diameter,
            "width_mm": width_mm,
            "height_mm": height_mm,
            "perimeter_mm": perimeter_px * millimeters_per_pixel,
            "circularity": circularity,
            "aspect_ratio": aspect_ratio,
            "size_class": size_class,
            "center_x_px": int(round(center_x / scale)),
            "center_y_px": int(round(center_y / scale)),
        })
        accepted.append((contour, number, size_class, center_x, center_y))
        total_hole_area += area_mm2

    colors = {"小": (0, 210, 0), "中": (0, 165, 255), "大": (0, 0, 255)}
    overlay = source.copy()
    for contour, number, size_class, center_x, center_y in accepted:
        color = colors[size_class]
        thickness = cv2.FILLED if as_bool(parameters, "fill_contours", True) else 2
        cv2.drawContours(overlay, [contour], -1, color, thickness)
    result_image = cv2.addWeighted(source, 0.70, overlay, 0.30, 0)
    if analysis_scope == "bread":
        bread_contours_result = cv2.findContours(measurement_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        bread_contours = bread_contours_result[0] if len(bread_contours_result) == 2 else bread_contours_result[1]
        cv2.drawContours(result_image, bread_contours, -1, (255, 100, 0), 3)
    for contour, number, size_class, center_x, center_y in accepted:
        color = colors[size_class]
        cv2.drawContours(result_image, [contour], -1, color, 2)
        if as_bool(parameters, "show_numbers", True):
            cv2.putText(
                result_image,
                str(number),
                (center_x, center_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

    areas = sorted([item["area_mm2"] for item in holes])
    diameters = [item["eq_diameter_mm"] for item in holes]
    count = len(holes)
    if count == 0:
        median_area = 0.0
    elif count % 2 == 1:
        median_area = areas[count // 2]
    else:
        median_area = (areas[count // 2 - 1] + areas[count // 2]) / 2.0
    summary = {
        "bread_area_mm2": bread_area_mm2,
        "hole_count": count,
        "hole_area_mm2": total_hole_area,
        "porosity_percent": (total_hole_area / bread_area_mm2 * 100.0) if bread_area_mm2 else 0.0,
        "binary_white_area_mm2": binary_white_area_mm2,
        "binary_black_area_mm2": binary_black_area_mm2,
        "binary_white_percent": binary_white_percent,
        "binary_black_percent": binary_black_percent,
        "mean_hole_area_mm2": (total_hole_area / count) if count else 0.0,
        "median_hole_area_mm2": median_area,
        "max_hole_area_mm2": max(areas) if areas else 0.0,
        "mean_eq_diameter_mm": (sum(diameters) / count) if count else 0.0,
        "small_hole_count": len([item for item in holes if item["size_class"] == "小"]),
        "medium_hole_count": len([item for item in holes if item["size_class"] == "中"]),
        "large_hole_count": len([item for item in holes if item["size_class"] == "大"]),
    }

    result_filename = prefix + "_overlay.png"
    write_image(output_dir, result_filename, result_image)
    intermediate_files = {}
    if as_bool(parameters, "save_intermediates", True):
        stages = {
            "gray": gray,
            "clahe": enhanced,
            "threshold": binary,
            "binary_area": binary_area_view,
            "morphology": morphology,
            "measurement_mask": measurement_mask,
            "large_hole_contrast": large_hole_contrast,
            "large_hole_mask": large_hole_mask,
            "final_mask": final_mask,
        }
        if as_bool(parameters, "use_distance", True):
            if float(distance.max()) > 0:
                distance_view = cv2.normalize(distance, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
            else:
                distance_view = np.zeros_like(gray)
            stages["distance"] = distance_view
        if as_bool(parameters, "use_watershed", True):
            stages["watershed"] = watershed_view
        for stage_name, stage_image in stages.items():
            filename = prefix + "_" + stage_name + ".png"
            intermediate_files[stage_name] = write_image(intermediate_dir, filename, stage_image)

    return {
        "ok": True,
        "engine": {
            "python_version": platform.python_version(),
            "opencv_version": cv2.__version__,
            "numpy_version": np.__version__,
            "algorithm_version": ALGORITHM_VERSION,
        },
        "summary": summary,
        "holes": holes,
        "result_image": result_filename,
        "intermediates": intermediate_files,
    }


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diagnose", action="store_true")
    parser.add_argument("--detect-bread", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output-dir")
    parser.add_argument("--intermediate-dir")
    parser.add_argument("--parameters-json", default="{}")
    parser.add_argument("--prefix", default="analysis")
    parser.add_argument("--mask-output")
    parser.add_argument("--measurement-mask")
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    if arguments.diagnose:
        result = diagnostic_result()
    elif arguments.detect_bread:
        if not arguments.input or not arguments.mask_output:
            raise RuntimeError("パン輪郭検出に必要な引数が不足しています。")
        source = cv2.imread(arguments.input, cv2.IMREAD_COLOR)
        if source is None:
            raise RuntimeError("輪郭検出画像を読み込めません。")
        parameters = json.loads(arguments.parameters_json)
        mask = detect_bread_mask(source, parameters)
        if not cv2.imwrite(arguments.mask_output, mask):
            raise RuntimeError("パン輪郭マスクを書き出せません。")
        result = {
            "ok": True,
            "mode": "bread_mask",
            "width": int(mask.shape[1]),
            "height": int(mask.shape[0]),
            "area_pixels": int(cv2.countNonZero(mask)),
            "algorithm_version": ALGORITHM_VERSION,
        }
    else:
        if not arguments.input or not arguments.output_dir or not arguments.intermediate_dir:
            raise RuntimeError("解析に必要な引数が不足しています。")
        parameters = json.loads(arguments.parameters_json)
        if not isinstance(parameters, dict):
            raise RuntimeError("解析パラメータが不正です。")
        result = analyze(
            arguments.input,
            arguments.output_dir,
            arguments.intermediate_dir,
            arguments.prefix,
            parameters,
            arguments.measurement_mask,
        )
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(str(error) + "\n")
        sys.stderr.write(traceback.format_exc())
        sys.exit(1)
