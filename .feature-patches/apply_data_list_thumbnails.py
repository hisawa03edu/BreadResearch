from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# assets/app.js
path = Path('assets/app.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  sortDir:'desc',\n  visibleColumns:{}\n};",
    "  sortDir:'desc',\n  visibleColumns:{},\n  showThumbnails:false\n};",
    'dataTableState initial thumbnail flag'
)
text = replace_once(
    text,
    " $('dataPageSize').value=String(dataTableState.pageSize||50);\n renderColumnPicker();",
    " $('dataPageSize').value=String(dataTableState.pageSize||50);\n if($('dataThumbnailToggle'))$('dataThumbnailToggle').checked=!!dataTableState.showThumbnails;\n renderColumnPicker();",
    'initialize thumbnail toggle'
)
text = replace_once(
    text,
    "function formatCell(v,type){\n if(v===null||v===undefined||v==='')return '';\n if(type==='number'){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:3}):esc(v);}\n return esc(v);\n}\nfunction renderSamplesTable(){",
    "function formatCell(v,type){\n if(v===null||v===undefined||v==='')return '';\n if(type==='number'){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:3}):esc(v);}\n return esc(v);\n}\nfunction sampleThumbnailCell(path,label,sampleId){\n if(!path)return '<td class=\"thumbnail-cell\"><span class=\"thumbnail-empty\">—</span></td>';\n return `<td class=\"thumbnail-cell\"><button type=\"button\" class=\"thumbnail-button\" onclick=\"viewSavedAnalysis(${sampleId})\" title=\"${esc(label)}を開く\"><img class=\"sample-thumbnail\" src=\"${esc(path)}\" alt=\"${esc(label)}\" loading=\"lazy\"></button></td>`;\n}\nfunction renderSamplesTable(){",
    'thumbnail cell helper'
)
text = replace_once(
    text,
    " const cols=getVisibleSampleColumns();\n $('samplesTable').innerHTML=`<thead><tr><th class=\"select-cell\"><input id=\"selectPageSamples\" type=\"checkbox\" title=\"このページをすべて選択\"></th>${cols.map(c=>{",
    " const cols=getVisibleSampleColumns();\n const showThumbnails=!!dataTableState.showThumbnails;\n const thumbnailHeaders=showThumbnails?'<th class=\"thumbnail-cell\">元画像</th><th class=\"thumbnail-cell\">解析結果</th>':'';\n $('samplesTable').innerHTML=`<thead><tr><th class=\"select-cell\"><input id=\"selectPageSamples\" type=\"checkbox\" title=\"このページをすべて選択\"></th>${thumbnailHeaders}${cols.map(c=>{",
    'thumbnail table headers'
)
text = replace_once(
    text,
    " rows.map(s=>`<tr class=\"${selectedSampleIds.has(Number(s.id))?'selected-row':''}\"><td class=\"select-cell\"><input class=\"sample-select\" type=\"checkbox\" data-sample-id=\"${s.id}\" ${selectedSampleIds.has(Number(s.id))?'checked':''}></td>${cols.map(c=>`<td>${formatCell(s[c.key],c.type)}</td>`).join('')}<td class=\"action-cell\"><button onclick=\"viewSavedAnalysis(${s.id})\">画像・結果</button> <button onclick=\"showHoles(${s.id})\">空洞詳細</button> <button onclick=\"deleteSample(${s.id})\">削除</button></td></tr>`).join('')+'</tbody>';",
    " rows.map(s=>{const thumbs=showThumbnails?sampleThumbnailCell(s.original_image_path,'元画像',s.id)+sampleThumbnailCell(s.latest_corrected_result_path||s.result_image_path,'解析結果',s.id):'';return `<tr class=\"${selectedSampleIds.has(Number(s.id))?'selected-row':''}\"><td class=\"select-cell\"><input class=\"sample-select\" type=\"checkbox\" data-sample-id=\"${s.id}\" ${selectedSampleIds.has(Number(s.id))?'checked':''}></td>${thumbs}${cols.map(c=>`<td>${formatCell(s[c.key],c.type)}</td>`).join('')}<td class=\"action-cell\"><button onclick=\"viewSavedAnalysis(${s.id})\">画像・結果</button> <button onclick=\"showHoles(${s.id})\">空洞詳細</button> <button onclick=\"deleteSample(${s.id})\">削除</button></td></tr>`;}).join('')+'</tbody>';",
    'thumbnail table rows'
)
text = replace_once(
    text,
    "$('dataPageSize').onchange=e=>{dataTableState.pageSize=e.target.value==='all'?'all':Number(e.target.value);dataTableState.page=1;renderSamplesTable();};\n$('dataPrevPage').onclick=()=>{if(dataTableState.page>1){dataTableState.page--;renderSamplesTable();}};",
    "$('dataPageSize').onchange=e=>{dataTableState.pageSize=e.target.value==='all'?'all':Number(e.target.value);dataTableState.page=1;renderSamplesTable();};\n$('dataThumbnailToggle').onchange=e=>{dataTableState.showThumbnails=!!e.target.checked;saveDataTableState();renderSamplesTable();};\n$('dataPrevPage').onclick=()=>{if(dataTableState.page>1){dataTableState.page--;renderSamplesTable();}};",
    'thumbnail toggle handler'
)
text = replace_once(
    text,
    " dataTableState={search:'',page:1,pageSize:50,sortKey:'processed_at',sortDir:'desc',visibleColumns:{}};",
    " dataTableState={search:'',page:1,pageSize:50,sortKey:'processed_at',sortDir:'desc',visibleColumns:{},showThumbnails:false};",
    'reset thumbnail flag'
)
path.write_text(text, encoding='utf-8')

# index.php
path = Path('index.php')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "    </div>\n    <div class=\"selection-toolbar\">\n      <strong id=\"selectedSampleCount\">選択データ：0件</strong>",
    "    </div>\n    <div class=\"thumbnail-toolbar\">\n      <label class=\"inline-check\"><input id=\"dataThumbnailToggle\" type=\"checkbox\"> サムネイルを表示（元画像・解析結果）</label>\n      <span class=\"small-note\">OFF時は画像を読み込まないため、一覧を軽く表示できます。</span>\n    </div>\n    <div class=\"selection-toolbar\">\n      <strong id=\"selectedSampleCount\">選択データ：0件</strong>",
    'thumbnail toolbar'
)
text = text.replace('assets/app.js?v=10.6.0-view3', 'assets/app.js?v=10.6.0-view4')
path.write_text(text, encoding='utf-8')

# api.php
path = Path('api.php')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '        $st = $pdo->prepare("SELECT s.*, t.name treatment_name\n            FROM samples s JOIN treatments t ON t.id=s.treatment_id\n            WHERE s.experiment_id=? ORDER BY t.display_order,s.sample_code,s.id");',
    '        $st = $pdo->prepare("SELECT s.*, t.name treatment_name,\n            (SELECT mc.corrected_result_path FROM manual_corrections mc\n             WHERE mc.sample_id=s.id ORDER BY mc.created_at DESC,mc.id DESC LIMIT 1) latest_corrected_result_path\n            FROM samples s JOIN treatments t ON t.id=s.treatment_id\n            WHERE s.experiment_id=? ORDER BY t.display_order,s.sample_code,s.id");',
    'latest corrected result in sample list'
)
path.write_text(text, encoding='utf-8')

# assets/style.css
path = Path('assets/style.css')
text = path.read_text(encoding='utf-8')
css = '''\n\n.thumbnail-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0 10px;padding:8px 10px;background:#f6f9fc;border:1px solid var(--line);border-radius:8px}\n.thumbnail-cell{text-align:center!important;vertical-align:middle!important;min-width:118px}\n.thumbnail-button{display:inline-block;padding:3px;border:1px solid #c8d0d8;background:#fff;border-radius:7px;line-height:0}\n.thumbnail-button:hover{background:#eef6fc}\n.sample-thumbnail{display:block;width:108px;height:78px;object-fit:contain;background:#222;border-radius:4px}\n.thumbnail-empty{color:#7b8794}\n'''
if '.sample-thumbnail{' not in text:
    text += css
path.write_text(text, encoding='utf-8')

# README note
path = Path('README.md')
text = path.read_text(encoding='utf-8')
needle = '## Version 10.6.0の追加機能\n\n'
if needle in text and 'データ一覧で元画像・解析結果のサムネイル' not in text:
    text = text.replace(needle, needle + '- データ一覧で元画像・解析結果のサムネイルを一括表示・非表示可能（初期OFF）\n', 1)
path.write_text(text, encoding='utf-8')
