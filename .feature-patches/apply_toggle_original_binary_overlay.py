from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# app.js: make binary image an overlay over the source image with opacity control,
# hide the standalone original image by default, and provide an opt-in toggle.
app = Path('assets/app.js').read_text(encoding='utf-8')
old_binary = '''const binaryViewer=binaryAreaUrl?`<figure class="result-comparison binary-image-viewer"><div class="result-view-controls"><label class="result-zoom-control">表示倍率 <input class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output>100%</output></label></div><div class="result-zoom-viewport"><div class="result-overlay-stage" data-image-width="${prepared.width}" data-image-height="${prepared.height}" style="--result-aspect:${prepared.width}/${prepared.height}"><img class="result-base-image" src="${binaryAreaUrl}" alt="二値化画像"></div></div><figcaption>二値化画像（白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption></figure>`:'';'''
new_binary = '''const binaryViewer=binaryAreaUrl?`<figure class="result-comparison binary-image-viewer"><div class="result-view-controls"><label class="result-opacity-control">二値化画像の濃度 <input class="result-opacity-range" type="range" min="0" max="100" value="60"><output>60%</output></label><label class="result-zoom-control">表示倍率 <input class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output>100%</output></label></div><div class="result-zoom-viewport"><div class="result-overlay-stage" data-image-width="${prepared.width}" data-image-height="${prepared.height}" style="--result-aspect:${prepared.width}/${prepared.height}"><img class="result-base-image" src="${prepared.analysisDataUrl}" alt="解析範囲の元画像"><img class="result-overlay-image" src="${binaryAreaUrl}" alt="二値化画像" style="opacity:.6"></div></div><figcaption>二値化画像（元画像＋二値化オーバーレイ／白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption></figure>`:'';'''
if app.count(old_binary) != 1:
    raise SystemExit(f'assets/app.js: binary viewer match count {app.count(old_binary)}')
app = app.replace(old_binary, new_binary, 1)

old_result = '''<div class="metric-grid">${metrics}</div><div class="result-grid"><figure><img src="${prepared.originalDataUrl}" alt="元画像"><figcaption>元画像</figcaption></figure><figure class="result-comparison"><div class="result-view-controls">'''
new_result = '''<div class="metric-grid">${metrics}</div><div class="image-visibility-toolbar"><label class="inline-check"><input class="original-visibility-toggle" type="checkbox"> 元画像を表示</label></div><div class="result-grid"><figure class="original-result-figure hidden"><img src="${prepared.originalDataUrl}" alt="元画像"><figcaption>元画像</figcaption></figure><figure class="result-comparison"><div class="result-view-controls">'''
if app.count(old_result) != 1:
    raise SystemExit(f'assets/app.js: result grid match count {app.count(old_result)}')
app = app.replace(old_result, new_result, 1)

old_listener = '''document.addEventListener('input',event=>{\n const figure=event.target.closest('.result-comparison');if(!figure)return;\n if(event.target.classList.contains('result-opacity-range')){\n  const value=Math.min(100,Math.max(0,Number(event.target.value)||0)),overlay=figure.querySelector('.result-overlay-image'),output=event.target.closest('label')?.querySelector('output');\n  if(overlay)overlay.style.opacity=String(value/100);if(output)output.textContent=`${value}%`;\n }\n if(event.target.classList.contains('result-zoom-range')){\n  const value=Math.min(300,Math.max(25,Number(event.target.value)||100)),output=event.target.closest('label')?.querySelector('output');\n  applyResultZoom(figure,value);if(output)output.textContent=`${value}%`;\n }\n});'''
new_listener = old_listener + '''\ndocument.addEventListener('change',event=>{\n if(!event.target.classList.contains('original-visibility-toggle'))return;\n const card=event.target.closest('.card');\n const originalFigure=card?.querySelector('.original-result-figure');\n if(originalFigure)originalFigure.classList.toggle('hidden',!event.target.checked);\n});'''
if app.count(old_listener) != 1:
    raise SystemExit(f'assets/app.js: input listener match count {app.count(old_listener)}')
app = app.replace(old_listener, new_listener, 1)

old_saved_init = '''$('savedOriginalImage').src=originalUrl;$('savedResultImage').src=resultUrl;$('savedResultImage').style.opacity='.6';$('savedResultOpacity').value='60';$('savedResultOpacityValue').textContent='60%';$('savedResultZoom').value='100';$('savedResultZoomValue').textContent='100%';$('savedResultOverlayStage').style.width='100%';$('savedResultOverlayStage').classList.remove('zoom-reduced');'''
new_saved_init = '''$('savedOriginalImage').src=originalUrl;$('savedOriginalToggle').checked=false;$('savedOriginalFigure').classList.add('hidden');$('savedResultImage').src=resultUrl;$('savedResultImage').style.opacity='.6';$('savedResultOpacity').value='60';$('savedResultOpacityValue').textContent='60%';$('savedResultZoom').value='100';$('savedResultZoomValue').textContent='100%';$('savedResultOverlayStage').style.width='100%';$('savedResultOverlayStage').classList.remove('zoom-reduced');'''
if app.count(old_saved_init) != 1:
    raise SystemExit(f'assets/app.js: saved init match count {app.count(old_saved_init)}')
app = app.replace(old_saved_init, new_saved_init, 1)

old_binary_saved = '''$('savedBinaryImage').src=binaryUrl;stage.dataset.imageWidth=String(binaryImage.naturalWidth);stage.dataset.imageHeight=String(binaryImage.naturalHeight);stage.style.setProperty('--result-aspect',`${binaryImage.naturalWidth}/${binaryImage.naturalHeight}`);stage.style.width='100%';stage.classList.remove('zoom-reduced');\n    $('savedBinaryZoom').value='100';$('savedBinaryZoomValue').textContent='100%';binaryFigure.classList.remove('hidden');'''
new_binary_saved = '''$('savedBinaryImage').src=binaryUrl;$('savedBinaryImage').style.opacity='.6';$('savedBinaryOpacity').value='60';$('savedBinaryOpacityValue').textContent='60%';stage.dataset.imageWidth=String(binaryImage.naturalWidth);stage.dataset.imageHeight=String(binaryImage.naturalHeight);stage.style.setProperty('--result-aspect',`${binaryImage.naturalWidth}/${binaryImage.naturalHeight}`);stage.style.width='100%';stage.classList.remove('zoom-reduced');\n    const binaryBase=$('savedBinaryBaseCanvas'),binaryBaseContext=binaryBase.getContext('2d'),resultBase=$('savedResultBaseCanvas');binaryBase.width=binaryImage.naturalWidth;binaryBase.height=binaryImage.naturalHeight;binaryBaseContext.clearRect(0,0,binaryBase.width,binaryBase.height);binaryBaseContext.drawImage(resultBase,0,0,binaryBase.width,binaryBase.height);\n    $('savedBinaryZoom').value='100';$('savedBinaryZoomValue').textContent='100%';binaryFigure.classList.remove('hidden');'''
if app.count(old_binary_saved) != 1:
    raise SystemExit(f'assets/app.js: saved binary match count {app.count(old_binary_saved)}')
app = app.replace(old_binary_saved, new_binary_saved, 1)
Path('assets/app.js').write_text(app, encoding='utf-8')

# index.php: saved view defaults to the two overlays, with standalone original opt-in.
index = Path('index.php').read_text(encoding='utf-8')
old_saved_html = '''    <div id="savedAnalysisMetrics" class="metric-grid"></div>\n    <div class="result-grid">\n      <figure>\n        <img id="savedOriginalImage" alt="保存済み元画像">\n        <figcaption>元画像</figcaption>\n      </figure>'''
new_saved_html = '''    <div id="savedAnalysisMetrics" class="metric-grid"></div>\n    <div class="image-visibility-toolbar"><label class="inline-check"><input id="savedOriginalToggle" class="original-visibility-toggle" type="checkbox"> 元画像を表示</label></div>\n    <div class="result-grid">\n      <figure id="savedOriginalFigure" class="original-result-figure hidden">\n        <img id="savedOriginalImage" alt="保存済み元画像">\n        <figcaption>元画像</figcaption>\n      </figure>'''
if index.count(old_saved_html) != 1:
    raise SystemExit(f'index.php: saved original match count {index.count(old_saved_html)}')
index = index.replace(old_saved_html, new_saved_html, 1)

old_saved_binary_html = '''      <figure id="savedBinaryFigure" class="result-comparison hidden">\n        <div class="result-view-controls">\n          <label class="result-zoom-control">表示倍率 <input id="savedBinaryZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedBinaryZoomValue">100%</output></label>\n        </div>\n        <div class="result-zoom-viewport"><div id="savedBinaryStage" class="result-overlay-stage"><img id="savedBinaryImage" class="result-base-image" alt="保存済み二値化画像"></div></div>\n        <figcaption>二値化画像（白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption>\n      </figure>'''
new_saved_binary_html = '''      <figure id="savedBinaryFigure" class="result-comparison hidden">\n        <div class="result-view-controls">\n          <label class="result-opacity-control">二値化画像の濃度 <input id="savedBinaryOpacity" class="result-opacity-range" type="range" min="0" max="100" value="60"><output id="savedBinaryOpacityValue">60%</output></label>\n          <label class="result-zoom-control">表示倍率 <input id="savedBinaryZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedBinaryZoomValue">100%</output></label>\n        </div>\n        <div class="result-zoom-viewport"><div id="savedBinaryStage" class="result-overlay-stage"><canvas id="savedBinaryBaseCanvas" class="result-base-image"></canvas><img id="savedBinaryImage" class="result-overlay-image" alt="保存済み二値化画像" style="opacity:.6"></div></div>\n        <figcaption>二値化画像（元画像＋二値化オーバーレイ／白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption>\n      </figure>'''
if index.count(old_saved_binary_html) != 1:
    raise SystemExit(f'index.php: saved binary html match count {index.count(old_saved_binary_html)}')
index = index.replace(old_saved_binary_html, new_saved_binary_html, 1)
index = index.replace('assets/app.js?v=10.6.0-view2', 'assets/app.js?v=10.6.0-view3', 1)
Path('index.php').write_text(index, encoding='utf-8')

# python/analyze.py: the binary-area image is now a primary result view, so always
# save it even when optional intermediate images are disabled.
py = Path('python/analyze.py').read_text(encoding='utf-8')
old_save = '''    intermediate_files = {}\n    if as_bool(parameters, "save_intermediates", True):\n        stages = {\n            "gray": gray,\n            "clahe": enhanced,\n            "threshold": binary,\n            "binary_area": binary_area_view,\n            "morphology": morphology,'''
new_save = '''    binary_area_filename = prefix + "_binary_area.png"\n    intermediate_files = {"binary_area": write_image(intermediate_dir, binary_area_filename, binary_area_view)}\n    if as_bool(parameters, "save_intermediates", True):\n        stages = {\n            "gray": gray,\n            "clahe": enhanced,\n            "threshold": binary,\n            "morphology": morphology,'''
if py.count(old_save) != 1:
    raise SystemExit(f'python/analyze.py: intermediate save match count {py.count(old_save)}')
py = py.replace(old_save, new_save, 1)
Path('python/analyze.py').write_text(py, encoding='utf-8')

# README note.
readme = Path('README.md').read_text(encoding='utf-8')
needle = '## Version 10.6.0の追加機能\n\n'
insert = ('## Version 10.6.0の追加機能\n\n'
          '- 画像表示は「解析結果」「二値化画像」を基本の2画面とし、独立した元画像は「元画像を表示」で切替可能\n'
          '- 二値化画像も元画像へ重ね、濃度0～100%と表示倍率25～300%を調整可能\n')
if readme.count(needle) != 1:
    raise SystemExit('README.md: version heading not found exactly once')
Path('README.md').write_text(readme.replace(needle, insert, 1), encoding='utf-8')
