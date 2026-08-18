from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError("Expected exactly one match in {} but found {}".format(path, count))
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Python analysis engine
replace_once("python/analyze.py", 'ALGORITHM_VERSION = "10.5.0-python"', 'ALGORITHM_VERSION = "10.6.0-python"')
replace_once(
    "python/analyze.py",
    """    morphology = cv2.bitwise_and(morphology, analysis_domain)\n\n    final_mask = morphology.copy()""",
    """    morphology = cv2.bitwise_and(morphology, analysis_domain)\n\n    # Version 10.6: quantify the raw binarized image itself, separately from\n    # contour filtering / Watershed. White pixels are pore candidates and\n    # black pixels are crumb surface. Only the measurement mask is counted,\n    # so the background outside a manually corrected bread contour is ignored.\n    binary_measurement = cv2.bitwise_and(binary, measurement_mask)\n    binary_domain_pixels = int(cv2.countNonZero(measurement_mask))\n    binary_white_pixels = int(cv2.countNonZero(binary_measurement))\n    binary_black_pixels = max(0, binary_domain_pixels - binary_white_pixels)\n    binary_white_area_mm2 = binary_white_pixels * pixel_area_to_mm2\n    binary_black_area_mm2 = binary_black_pixels * pixel_area_to_mm2\n    binary_white_percent = (\n        float(binary_white_pixels) / float(binary_domain_pixels) * 100.0\n        if binary_domain_pixels else 0.0\n    )\n    binary_black_percent = (\n        float(binary_black_pixels) / float(binary_domain_pixels) * 100.0\n        if binary_domain_pixels else 0.0\n    )\n    # Gray indicates pixels outside the measurement range. This makes the\n    # intermediate image visually match the pixels used for the area totals.\n    binary_area_view = np.full_like(gray, 127, dtype=np.uint8)\n    inside_measurement = measurement_mask > 0\n    binary_area_view[inside_measurement] = 0\n    binary_area_view[inside_measurement & (binary > 0)] = 255\n\n    final_mask = morphology.copy()""",
)
replace_once(
    "python/analyze.py",
    """        \"porosity_percent\": (total_hole_area / bread_area_mm2 * 100.0) if bread_area_mm2 else 0.0,\n        \"mean_hole_area_mm2\": (total_hole_area / count) if count else 0.0,""",
    """        \"porosity_percent\": (total_hole_area / bread_area_mm2 * 100.0) if bread_area_mm2 else 0.0,\n        \"binary_white_area_mm2\": binary_white_area_mm2,\n        \"binary_black_area_mm2\": binary_black_area_mm2,\n        \"binary_white_percent\": binary_white_percent,\n        \"binary_black_percent\": binary_black_percent,\n        \"mean_hole_area_mm2\": (total_hole_area / count) if count else 0.0,""",
)
replace_once(
    "python/analyze.py",
    """            \"threshold\": binary,\n            \"morphology\": morphology,""",
    """            \"threshold\": binary,\n            \"binary_area\": binary_area_view,\n            \"morphology\": morphology,""",
)

# PHP API / database persistence
replace_once(
    "api.php",
    """    $keys = ['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent','mean_hole_area_mm2',\n        'median_hole_area_mm2','max_hole_area_mm2','mean_eq_diameter_mm','small_hole_count',""",
    """    $keys = ['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent',\n        'binary_white_area_mm2','binary_black_area_mm2','binary_white_percent','binary_black_percent','mean_hole_area_mm2',\n        'median_hole_area_mm2','max_hole_area_mm2','mean_eq_diameter_mm','small_hole_count',""",
)
replace_once(
    "api.php",
    """        processed_at,dpi,parameter_json,bread_area_mm2,hole_count,hole_area_mm2,\n        porosity_percent,mean_hole_area_mm2,median_hole_area_mm2,max_hole_area_mm2,\n        mean_eq_diameter_mm,small_hole_count,medium_hole_count,large_hole_count,""",
    """        processed_at,dpi,parameter_json,bread_area_mm2,hole_count,hole_area_mm2,\n        porosity_percent,binary_white_area_mm2,binary_black_area_mm2,binary_white_percent,binary_black_percent,\n        mean_hole_area_mm2,median_hole_area_mm2,max_hole_area_mm2,\n        mean_eq_diameter_mm,small_hole_count,medium_hole_count,large_hole_count,""",
)
replace_once(
    "api.php",
    ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)\";",
    ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)\";",
)
replace_once(
    "api.php",
    """        (float)$s['bread_area_mm2'], (int)$s['hole_count'], (float)$s['hole_area_mm2'],\n        (float)$s['porosity_percent'], (float)$s['mean_hole_area_mm2'],""",
    """        (float)$s['bread_area_mm2'], (int)$s['hole_count'], (float)$s['hole_area_mm2'],\n        (float)$s['porosity_percent'],\n        isset($s['binary_white_area_mm2']) ? (float)$s['binary_white_area_mm2'] : null,\n        isset($s['binary_black_area_mm2']) ? (float)$s['binary_black_area_mm2'] : null,\n        isset($s['binary_white_percent']) ? (float)$s['binary_white_percent'] : null,\n        isset($s['binary_black_percent']) ? (float)$s['binary_black_percent'] : null,\n        (float)$s['mean_hole_area_mm2'],""",
)
replace_once(
    "api.php",
    """            'porosity_percent'=>'空洞率(%)','mean_hole_area_mm2'=>'平均空洞面積(mm²)',\n            'median_hole_area_mm2'=>'空洞面積中央値(mm²)',""",
    """            'porosity_percent'=>'空洞率(%)','mean_hole_area_mm2'=>'平均空洞面積(mm²)',\n            'binary_white_area_mm2'=>'二値化白領域（空洞）面積(mm²)',\n            'binary_black_area_mm2'=>'二値化黒領域（生地）面積(mm²)',\n            'binary_white_percent'=>'二値化白領域率(%)','binary_black_percent'=>'二値化黒領域率(%)',\n            'median_hole_area_mm2'=>'空洞面積中央値(mm²)',""",
)
replace_once(
    "api.php",
    """        $statement->execute($parameters);\n        $rows = $statement->fetchAll();\n        if (!$rows) respond(['ok'=>false,'error'=>'統計処理できるデータがありません。'],422);""",
    """        $statement->execute($parameters);\n        $rows = $statement->fetchAll();\n        // Metrics added in newer versions remain NULL for historical analyses.\n        // Exclude those rows instead of silently treating NULL as zero.\n        $rows = array_values(array_filter($rows, fn($row) => $row['metric_value'] !== null));\n        if (!$rows) respond(['ok'=>false,'error'=>'統計処理できるデータがありません。'],422);""",
)
replace_once(
    "api.php",
    "$input['parameters']['algorithm_version'] = $analysis['engine']['algorithm_version'] ?? '10.5.0-python';",
    "$input['parameters']['algorithm_version'] = $analysis['engine']['algorithm_version'] ?? '10.6.0-python';",
)

# Browser UI
replace_once(
    "assets/app.js",
    """ {key:'hole_area_mm2',label:'空洞合計面積(mm²)',type:'number',visible:false},\n {key:'porosity_percent',label:'空洞率(%)',type:'number',visible:true},\n {key:'mean_hole_area_mm2',label:'平均空洞面積(mm²)',type:'number',visible:true},""",
    """ {key:'hole_area_mm2',label:'空洞合計面積(mm²)',type:'number',visible:false},\n {key:'porosity_percent',label:'空洞率(%)',type:'number',visible:true},\n {key:'binary_white_area_mm2',label:'二値化白領域（空洞）面積(mm²)',type:'number',visible:false},\n {key:'binary_black_area_mm2',label:'二値化黒領域（生地）面積(mm²)',type:'number',visible:false},\n {key:'binary_white_percent',label:'二値化白領域率(%)',type:'number',visible:false},\n {key:'binary_black_percent',label:'二値化黒領域率(%)',type:'number',visible:false},\n {key:'mean_hole_area_mm2',label:'平均空洞面積(mm²)',type:'number',visible:true},""",
)
replace_once(
    "assets/app.js",
    """ porosity_percent:'空洞率(%)',mean_hole_area_mm2:'平均空洞面積(mm²)',\n median_hole_area_mm2:'空洞面積中央値(mm²)',""",
    """ porosity_percent:'空洞率(%)',mean_hole_area_mm2:'平均空洞面積(mm²)',\n binary_white_area_mm2:'二値化白領域（空洞）面積(mm²)',binary_black_area_mm2:'二値化黒領域（生地）面積(mm²)',\n binary_white_percent:'二値化白領域率(%)',binary_black_percent:'二値化黒領域率(%)',\n median_hole_area_mm2:'空洞面積中央値(mm²)',""",
)
replace_once(
    "assets/app.js",
    """function formatMetricValue(key,value){\n const number=Number(value||0);return ['hole_count','small_hole_count','medium_hole_count','large_hole_count'].includes(key)?number.toLocaleString('ja-JP',{maximumFractionDigits:0}):number.toLocaleString('ja-JP',{minimumFractionDigits:3,maximumFractionDigits:3});\n}""",
    """function formatMetricValue(key,value){\n if(value===null||value===undefined||value==='')return '未計測';\n const number=Number(value||0);return ['hole_count','small_hole_count','medium_hole_count','large_hole_count'].includes(key)?number.toLocaleString('ja-JP',{maximumFractionDigits:0}):number.toLocaleString('ja-JP',{minimumFractionDigits:3,maximumFractionDigits:3});\n}""",
)
replace_once(
    "assets/app.js",
    "const labels={gray:'グレースケール',clahe:'CLAHE補正',threshold:'二値化',morphology:'形態処理',measurement_mask:'解析範囲マスク',large_hole_contrast:'大空洞コントラスト',large_hole_mask:'大空洞補完マスク',distance:'距離変換',watershed:'Watershed分割',final_mask:'最終気泡マスク'};return labels[key]||key;",
    "const labels={gray:'グレースケール',clahe:'CLAHE補正',threshold:'二値化',binary_area:'二値化面積集計（白=空洞・黒=生地・灰=範囲外）',morphology:'形態処理',measurement_mask:'解析範囲マスク',large_hole_contrast:'大空洞コントラスト',large_hole_mask:'大空洞補完マスク',distance:'距離変換',watershed:'Watershed分割',final_mask:'最終気泡マスク'};return labels[key]||key;",
)
replace_once(
    "assets/app.js",
    """  const keys=['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent',\n   'mean_hole_area_mm2','median_hole_area_mm2','max_hole_area_mm2',""",
    """  const keys=['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent',\n   'binary_white_area_mm2','binary_black_area_mm2','binary_white_percent','binary_black_percent',\n   'mean_hole_area_mm2','median_hole_area_mm2','max_hole_area_mm2',""",
)

# HTML version / statistics selector
replace_once("index.php", 'assets/style.css?v=10.5.5', 'assets/style.css?v=10.6.0')
replace_once("index.php", 'PHP + MySQL + Python OpenCV Version 10.5.5', 'PHP + MySQL + Python OpenCV Version 10.6.0')
replace_once(
    "index.php",
    """        <option value=\"hole_area_mm2\">空洞合計面積(mm²)</option>\n        <option value=\"porosity_percent\">空洞率(%)</option>\n        <option value=\"hole_count\">空洞数</option>""",
    """        <option value=\"hole_area_mm2\">空洞合計面積(mm²)</option>\n        <option value=\"porosity_percent\">空洞率(%)</option>\n        <option value=\"binary_white_area_mm2\">二値化白領域（空洞）面積(mm²)</option>\n        <option value=\"binary_black_area_mm2\">二値化黒領域（生地）面積(mm²)</option>\n        <option value=\"binary_white_percent\">二値化白領域率(%)</option>\n        <option value=\"binary_black_percent\">二値化黒領域率(%)</option>\n        <option value=\"hole_count\">空洞数</option>""",
)
replace_once("index.php", 'assets/app.js?v=10.5.5', 'assets/app.js?v=10.6.0')

# New-install schema and sample config
replace_once(
    "schema.sql",
    """    hole_area_mm2 DECIMAL(18,6) NOT NULL,\n    porosity_percent DECIMAL(12,6) NOT NULL,\n    mean_hole_area_mm2 DECIMAL(18,6) NOT NULL,""",
    """    hole_area_mm2 DECIMAL(18,6) NOT NULL,\n    porosity_percent DECIMAL(12,6) NOT NULL,\n    binary_white_area_mm2 DECIMAL(18,6) NULL,\n    binary_black_area_mm2 DECIMAL(18,6) NULL,\n    binary_white_percent DECIMAL(12,6) NULL,\n    binary_black_percent DECIMAL(12,6) NULL,\n    mean_hole_area_mm2 DECIMAL(18,6) NOT NULL,""",
)
replace_once("config.sample.php", "'app_version' => '10.5.5'", "'app_version' => '10.6.0'")

# Deployment gate: do not deploy 10.6 until production config was explicitly updated.
replace_once(
    ".github/workflows/deploy-xserver.yml",
    """             grep -Fq '10.5.5' '$TARGET/config.php' || { echo 'config.php app_version is not 10.5.5'; exit 6; }; \\\n""",
    """             grep -Fq '10.6.0' '$TARGET/config.php' || { echo 'config.php app_version is not 10.6.0'; exit 6; }; \\\n""",
)
replace_once(
    ".github/workflows/deploy-xserver.yml",
    """             test -f migration_v10_4_to_v10_5.sql; \\\n             grep -Fq 'Version 10.5.5' README.md; \\\n             grep -Fq '10.5.5' config.php; \\\n             echo 'Deploy verification OK: BreadResearch 10.5.5'""",
    """             test -f migration_v10_5_5_to_v10_6.sql; \\\n             grep -Fq 'Version 10.6.0' README.md; \\\n             grep -Fq '10.6.0' config.php; \\\n             echo 'Deploy verification OK: BreadResearch 10.6.0'""",
)

# Documentation
replace_once("README.md", "# Bread Research Analyzer Version 10.5.5", "# Bread Research Analyzer Version 10.6.0")
replace_once(
    "README.md",
    """Xserver共有サーバー上のPython版OpenCVを利用する、パン断面画像解析・研究支援システムです。\n\n## Version 10.5.5の修正""",
    """Xserver共有サーバー上のPython版OpenCVを利用する、パン断面画像解析・研究支援システムです。\n\n## Version 10.6.0の追加機能\n\n- 二値化直後の画像から、白領域（空洞）と黒領域（生地）の面積をmm²で算出\n- 二値化白領域率・黒領域率を算出し、白＋黒が解析対象面積になるよう集計\n- パン輪郭内モードでは輪郭外の背景を集計対象から除外\n- 二値化面積集計画像を保存し、白=空洞・黒=生地・灰=解析範囲外として確認可能\n- 新しい4指標を保存済み解析、データ一覧の表示列、統計比較項目で利用可能\n- Version 10.5.5以前の既存解析は新指標を「未計測」として扱い、統計で0として誤集計しない\n\n既存の`空洞合計面積`と`空洞率`は、輪郭抽出後に面積・形状条件を通過した空洞を集計した値です。Version 10.6.0の`二値化白領域`は、形態処理やWatershed、輪郭フィルタを行う前の二値化画像そのものを集計する別指標です。\n\n## Version 10.5.5の修正""",
)
replace_once(
    "README.md",
    """## Xserverへの更新方法\n\n1. 現在のWebアプリとデータベースをバックアップします。""",
    """## Xserverへの更新方法\n\nVersion 10.5.5から10.6.0へ更新する場合は、先にphpMyAdminで`migration_v10_5_5_to_v10_6.sql`を実行し、既存の`config.php`の`app_version`を`10.6.0`へ変更してからファイルをデプロイしてください。既存データの新しい二値化面積4項目はNULLのままなので、必要なサンプルを再解析すると値が保存されます。\n\n1. 現在のWebアプリとデータベースをバックアップします。""",
)

print("Binary area metrics changes applied successfully.")
