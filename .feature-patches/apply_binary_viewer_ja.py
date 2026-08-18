from pathlib import Path


def replace_one(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

# assets/app.js
path = Path('assets/app.js')
text = path.read_text(encoding='utf-8')
replacements = [
    ("{key:'binary_white_area_mm2',label:'二値化白領域（空洞）面積(mm²)',type:'number',visible:false}", "{key:'binary_white_area_mm2',label:'二値化白領域（空洞）面積 mm²',type:'number',visible:false}", 'sample white area label'),
    ("{key:'binary_black_area_mm2',label:'二値化黒領域（生地）面積(mm²)',type:'number',visible:false}", "{key:'binary_black_area_mm2',label:'二値化黒領域（生地）面積 mm²',type:'number',visible:false}", 'sample black area label'),
    ("{key:'binary_white_percent',label:'二値化白領域率(%)',type:'number',visible:false}", "{key:'binary_white_percent',label:'二値化白領域率 %',type:'number',visible:false}", 'sample white percent label'),
    ("{key:'binary_black_percent',label:'二値化黒領域率(%)',type:'number',visible:false}", "{key:'binary_black_percent',label:'二値化黒領域率 %',type:'number',visible:false}", 'sample black percent label'),
    ("binary_white_area_mm2:'二値化白領域（空洞）面積(mm²)',binary_black_area_mm2:'二値化黒領域（生地）面積(mm²)',\n binary_white_percent:'二値化白領域率(%)',binary_black_percent:'二値化黒領域率(%)',", "binary_white_area_mm2:'二値化白領域（空洞）面積 mm²',binary_black_area_mm2:'二値化黒領域（生地）面積 mm²',\n binary_white_percent:'二値化白領域率 %',binary_black_percent:'二値化黒領域率 %',", 'metric labels'),
]
for old, new, label in replacements:
    text = replace_one(text, old, new, label)

old = "   const metrics=Object.entries(saved.summary).map(([k,v])=>`<div class=\"metric\"><b>${esc(metricLabel(k))}</b><br>${formatMetricValue(k,v)}</div>`).join('');\n"
new = old + "   const binaryAreaUrl=intermediateUrls.binary_area||'';\n   const binaryViewer=binaryAreaUrl?`<figure class=\"result-comparison binary-image-viewer\"><div class=\"result-view-controls\"><label class=\"result-zoom-control\">表示倍率 <input class=\"result-zoom-range\" type=\"range\" min=\"25\" max=\"300\" step=\"5\" value=\"100\"><output>100%</output></label></div><div class=\"result-zoom-viewport\"><div class=\"result-overlay-stage\" data-image-width=\"${prepared.width}\" data-image-height=\"${prepared.height}\" style=\"--result-aspect:${prepared.width}/${prepared.height}\"><img class=\"result-base-image\" src=\"${binaryAreaUrl}\" alt=\"二値化画像\"></div></div><figcaption>二値化画像（白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption></figure>`:'';\n   const otherIntermediateUrls=Object.fromEntries(Object.entries(intermediateUrls).filter(([key])=>key!=='binary_area'));\n"
text = replace_one(text, old, new, 'insert immediate binary viewer')
text = replace_one(text,
    "<img class=\"result-overlay-image\" src=\"${resultUrl}\" alt=\"解析結果\" style=\"opacity:.6\"></div></div><figcaption>解析結果（拡大時は画像内をスクロールできます）</figcaption></figure></div>\n    ${Object.keys(intermediateUrls).length?`<details><summary>解析途中画像</summary><div class=\"intermediate-grid\">${Object.entries(intermediateUrls).map(([k,u])=>`<figure><img src=\"${u}\"><figcaption>${esc(intermediateLabel(k))}</figcaption></figure>`).join('')}</div></details>`:''}",
    "<img class=\"result-overlay-image\" src=\"${resultUrl}\" alt=\"解析結果\" style=\"opacity:.6\"></div></div><figcaption>解析結果（拡大時は画像内をスクロールできます）</figcaption></figure>${binaryViewer}</div>\n    ${Object.keys(otherIntermediateUrls).length?`<details><summary>解析途中画像</summary><div class=\"intermediate-grid\">${Object.entries(otherIntermediateUrls).map(([k,u])=>`<figure><img src=\"${u}\"><figcaption>${esc(intermediateLabel(k))}</figcaption></figure>`).join('')}</div></details>`:''}",
    'render immediate binary viewer')

old = "  await prepareSavedResultBase(originalUrl,resultUrl,p,roiData);\n"
new = old + "  const binaryFigure=$('savedBinaryFigure');binaryFigure.classList.add('hidden');\n  if(s.binary_area_image_path){\n   const binaryUrl=`${s.binary_area_image_path}?t=${Date.now()}`;\n   try{\n    const binaryImage=await loadUrlImage(binaryUrl),stage=$('savedBinaryStage');\n    $('savedBinaryImage').src=binaryUrl;stage.dataset.imageWidth=String(binaryImage.naturalWidth);stage.dataset.imageHeight=String(binaryImage.naturalHeight);stage.style.setProperty('--result-aspect',`${binaryImage.naturalWidth}/${binaryImage.naturalHeight}`);stage.style.width='100%';stage.classList.remove('zoom-reduced');\n    $('savedBinaryZoom').value='100';$('savedBinaryZoomValue').textContent='100%';binaryFigure.classList.remove('hidden');\n   }catch(_){binaryFigure.classList.add('hidden');}\n  }\n"
text = replace_one(text, old, new, 'saved binary viewer load')
text = replace_one(text,
    "panel.classList.remove('hidden');requestAnimationFrame(()=>applyResultZoom(panel.querySelector('.result-comparison'),100));panel.scrollIntoView({behavior:'smooth',block:'start'});",
    "panel.classList.remove('hidden');requestAnimationFrame(()=>panel.querySelectorAll('.result-comparison:not(.hidden)').forEach(figure=>applyResultZoom(figure,100)));panel.scrollIntoView({behavior:'smooth',block:'start'});",
    'saved viewer zoom all')
path.write_text(text, encoding='utf-8')

# index.php
path = Path('index.php')
text = path.read_text(encoding='utf-8')
for old, new, label in [
    ('二値化白領域（空洞）面積(mm²)', '二値化白領域（空洞）面積 mm²', 'index white area label'),
    ('二値化黒領域（生地）面積(mm²)', '二値化黒領域（生地）面積 mm²', 'index black area label'),
    ('二値化白領域率(%)', '二値化白領域率 %', 'index white percent label'),
    ('二値化黒領域率(%)', '二値化黒領域率 %', 'index black percent label'),
]:
    if old not in text:
        raise SystemExit(f'{label}: source text not found')
    text = text.replace(old, new)

saved_result_block = '''      <figure>\n        <div class="result-comparison">\n          <div class="result-view-controls">\n            <label class="result-opacity-control">検出結果の濃度 <input id="savedResultOpacity" class="result-opacity-range" type="range" min="0" max="100" value="60"><output id="savedResultOpacityValue">60%</output></label>\n            <label class="result-zoom-control">表示倍率 <input id="savedResultZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedResultZoomValue">100%</output></label>\n          </div>\n          <div class="result-zoom-viewport"><div id="savedResultOverlayStage" class="result-overlay-stage"><canvas id="savedResultBaseCanvas" class="result-base-image"></canvas><img id="savedResultImage" class="result-overlay-image" alt="保存済み解析画像" style="opacity:.6"></div></div>\n        </div>\n        <figcaption>解析結果（拡大時は画像内をスクロールできます）</figcaption>\n      </figure>'''
saved_binary_block = saved_result_block + '''\n      <figure id="savedBinaryFigure" class="result-comparison hidden">\n        <div class="result-view-controls">\n          <label class="result-zoom-control">表示倍率 <input id="savedBinaryZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedBinaryZoomValue">100%</output></label>\n        </div>\n        <div class="result-zoom-viewport"><div id="savedBinaryStage" class="result-overlay-stage"><img id="savedBinaryImage" class="result-base-image" alt="保存済み二値化画像"></div></div>\n        <figcaption>二値化画像（白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption>\n      </figure>'''
text = replace_one(text, saved_result_block, saved_binary_block, 'saved binary markup')
text = replace_one(text, 'assets/app.js?v=10.6.0', 'assets/app.js?v=10.6.0-view2', 'app cache bust')
path.write_text(text, encoding='utf-8')

# api.php
path = Path('api.php')
text = path.read_text(encoding='utf-8')
for old, new, label in [
    ("'binary_white_area_mm2'=>'二値化白領域（空洞）面積(mm²)'", "'binary_white_area_mm2'=>'二値化白領域（空洞）面積 mm²'", 'api white area label'),
    ("'binary_black_area_mm2'=>'二値化黒領域（生地）面積(mm²)'", "'binary_black_area_mm2'=>'二値化黒領域（生地）面積 mm²'", 'api black area label'),
    ("'binary_white_percent'=>'二値化白領域率(%)'", "'binary_white_percent'=>'二値化白領域率 %'", 'api white percent label'),
    ("'binary_black_percent'=>'二値化黒領域率(%)'", "'binary_black_percent'=>'二値化黒領域率 %'", 'api black percent label'),
]:
    text = replace_one(text, old, new, label)
old = "        if(!$item) respond(['ok'=>false,'error'=>'サンプルがありません。'],404);\n        respond(['ok'=>true,'item'=>$item]);\n"
new = "        if(!$item) respond(['ok'=>false,'error'=>'サンプルがありません。'],404);\n        $item['binary_area_image_path'] = null;\n        $resultFile = basename((string)($item['result_image_path'] ?? ''));\n        if (preg_match('/^(.+)_overlay\\.png$/', $resultFile, $match)) {\n            $candidate = 'uploads/intermediate/' . $match[1] . '_binary_area.png';\n            if (is_file(__DIR__ . '/' . $candidate)) $item['binary_area_image_path'] = $candidate;\n        }\n        respond(['ok'=>true,'item'=>$item]);\n"
text = replace_one(text, old, new, 'sample binary path')
path.write_text(text, encoding='utf-8')

# README.md
path = Path('README.md')
text = path.read_text(encoding='utf-8')
anchor = "## Version 10.6.0の追加機能\n\n"
addition = "- 指標名を「二値化白領域（空洞）面積 mm²」「二値化黒領域（生地）面積 mm²」「二値化白領域率 %」「二値化黒領域率 %」の日本語表記に統一\n- 二値化画像を解析結果と同じ25～300%の拡大・スクロール表示で確認可能\n- 保存済み解析でも、保存された二値化画像が存在する場合は同じ拡大表示で確認可能\n"
if addition not in text:
    text = replace_one(text, anchor, anchor + addition, 'README 10.6 display update')
path.write_text(text, encoding='utf-8')

print('Binary Japanese labels and viewer update applied successfully.')
