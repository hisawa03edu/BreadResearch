<?php
declare(strict_types=1);
session_start();
if (empty($_SESSION['bread_logged_in'])) { header('Location: index.php'); exit; }
$rows = [
['解析範囲','analysis_scope','矩形ROI','気泡解析の母集団を矩形ROIまたはパン輪郭内から選択。パン輪郭内では保存マスクからパン面積を計算。','矩形ROIは同一寸法・同一位置の比較に適する。','パン輪郭内はパン全体の面積と空洞率を評価できる。','研究目的に合わせて選び、同一比較内では方式を統一。'],
['DPI','dpi','300','ピクセルをmmへ換算する基準。面積・直径など全実寸値に影響。','低いほど算出寸法が大きい。','高いほど算出寸法が小さい。','実際の撮影条件または校正値を使用。'],
['解析縮小上限(px)','max_dimension','1400','ROI長辺をこの値以下に縮小して解析。','高速になるが微小空洞が消えやすい。','精細になるが時間・メモリが増える。','通常1200～2000。微小空洞重視は1800以上。'],
['CLAHE','use_clahe','使用','局所コントラストを補正して照明ムラを軽減。','自然な濃度を保つが暗部を取りこぼす場合がある。','弱い空洞と同時に微細模様も強調。','通常は使用。均一照明で過検出時は不使用も比較。'],
['CLAHEクリップ','clahe_clip','2.0','コントラスト増幅の上限。','補正が穏やかでノイズが減る。','暗い空洞を強調するが影も増える。','1.5～3.0、標準2.0。'],
['CLAHEタイル数','clahe_tiles','8','局所補正する縦横の分割数。','広い範囲で滑らかに補正。','小さなムラへ追従するが模様を強調。','通常6～12、標準8。'],
['平滑化','blur_size','5','二値化前のGaussian Blur。奇数を使用。','輪郭を保つがノイズが残る。','ノイズを減らすが小空洞が消える。','3～7、標準5。'],
['二値化','threshold_mode','適応的','空洞候補を抽出する方式。','—','—','照明ムラは適応的、均一照明は大津、暗い大空洞は複合を比較。'],
['固定しきい値','hole_threshold','145','複合モードで、この濃度未満を候補へ追加。','暗い部分だけになり厳しい。','明るい影まで拾い検出量が増える。','複合時120～170。適応的・大津では原則未使用。'],
['適応ブロック','adaptive_block','41','適応二値化の局所窓。奇数を使用。','局所変化へ追従するが大空洞中心が消えやすい。','大空洞を保つが照明ムラの影響が増える。','31～81。大空洞重視は51～81。'],
['適応C値','adaptive_c','5','局所平均から差し引く値。','候補が増え、薄い影も拾う。','検出が厳しくなり空洞数が減る。','3～10。1ずつ調整。'],
['オープニング','open_size','1','小ノイズ除去と細い接続の切断。0で不使用。','小空洞を保持。','ノイズを減らすが微小空洞が消える。','標準1、ノイズ時3。'],
['クロージング','close_size','3','輪郭の欠けを埋め、近い領域を接続。','分離を保つが輪郭が途切れやすい。','輪郭を補うが隣接空洞が結合しやすい。','3～7。結合時は下げる。'],
['距離変換','use_distance','使用','空洞中心を求めWatershedの種を作る。','二値マスクを直接使用。','接触空洞を分けやすい。','通常使用。過分割時は不使用も比較。'],
['距離しきい値比','distance_ratio','0.35','確実な中心とする距離最大値の比率。','中心が広がり拾いやすいが結合しやすい。','中心が狭まり分離するが小空洞の種が消える。','0.25～0.50、標準0.35。'],
['Watershed','use_watershed','使用','接触空洞を境界で分割。','連結候補が1個になりやすい。','分離できるが大空洞を過分割する場合がある。','食パンは通常使用。大空洞過分割時は不使用も比較。'],
['背景膨張回数','background_dilate','3','Watershedの確実な背景を作る膨張回数。','探索範囲が狭い。','探索範囲と近接領域の影響が増える。','2～4、標準3。'],
['大空洞補完','use_large_hole_rescue','使用','明暗差が弱く中心が消えた大空洞を別処理で補完。','従来の二値化結果だけを使用。','大空洞を回収するが影を拾う可能性。','空洞1個・空洞率約100%なら異常。直ちに不使用で比較。'],
['大空洞検出窓(px)','large_hole_window','61','Black-hatで局所背景を推定する窓。奇数。','小さい対象向け。大空洞全体を覆えない場合がある。','大きな空洞向けだが照明ムラの影響が増える。','対象径より大きく設定。通常61～101。'],
['大空洞コントラスト','large_hole_contrast','12','局所背景との差がこの値以上の暗部を候補化。','薄い空洞と影が増える。','明瞭な空洞だけになり取りこぼしが増える。','標準12。回収は10→8、過検出は15→20。'],
['大空洞候補最小面積(mm²)','large_hole_min_area_mm2','2','補完ルートで採用する候補の最小面積。','小候補とノイズが増える。','大きな候補だけになり中空洞を失う。','通常2～5。大空洞限定なら3～5。'],
['大空洞候補最大占有率(%)','large_hole_max_fraction','5','1候補がROIに占められる最大割合。巨大誤連結を除外。','安全だが真の巨大空洞を除外する場合がある。','巨大空洞を許すが誤検出リスクが上がる。','食パン3～5%、大きな気泡は5～10%を検討。'],
['境界除外幅(px)','border_margin','3','ROI端の不完全輪郭を除く外周幅。','端の空洞を残すが切断輪郭も含む。','端の誤検出を減らすが有効領域が減る。','2～5。全サンプルで統一。'],
['最小面積(mm²)','min_area_mm2','0.15','最終保存する空洞の面積下限。','微小空洞とノイズが増える。','ノイズが減るが小空洞を失う。','食パン0.10～0.30。論文に設定値を記載。'],
['最大面積(mm²)','max_area_mm2','0','最終保存する空洞の面積上限。0は無制限。','小さくすると大空洞を除外。','大きくするか0で巨大空洞も保存。','通常0。明らかな影等を面積で除く場合だけ設定。'],
['最小円形度','min_circularity','0','4π×面積÷周囲長²の下限。1ほど円形。','不整形空洞・亀裂も残る。','円形だけ残り自然な不整形空洞を失う。','パンでは0～0.15を推奨。'],
['最大縦横比','max_aspect_ratio','20','外接矩形の長辺÷短辺の上限。','細長い空洞を除外。','亀裂状領域も残す。','通常10～20。方向性研究では十分大きくする。'],
['小→中境界(mm)','small_limit_mm','2','円相当径がこの値未満を小空洞に分類。','小が減り中が増える。','小が増える。','標準2 mm。群間で統一。'],
['中→大境界(mm)','medium_limit_mm','4','円相当径がこの値以上を大空洞に分類。','大が増える。','大が減り中が増える。','食パン4 mm。フランスパンは5～10 mmも検討。'],
['輪郭塗りつぶし','fill_contours','はい','結果画像の候補内部を半透明色で塗る。計測値には無関係。','輪郭線だけで元画像を見やすい。','検出範囲を確認しやすい。','検証時は「はい」。'],
['空洞番号','show_numbers','表示','結果画像に空洞番号を描画。計測値には無関係。','画像が見やすい。','空洞詳細表と照合できる。','検証時表示、図版では非表示も可。'],
['中間画像','save_intermediates','表示','各工程とlarge_hole_maskを保存。','容量とI/Oを削減。','原因調査と再現性確認に有効。','条件決定中は表示。大量解析時は容量を確認。'],
];
?><!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>解析パラメータ説明マニュアル</title><link rel="stylesheet" href="assets/style.css?v=10.5.5"><style>
body{background:#f4f7fa}.manual{max-width:1500px;margin:auto;padding:24px}.manual-head{display:flex;gap:12px;align-items:center;justify-content:space-between}.manual table{min-width:1250px}.manual td,.manual th{vertical-align:top;line-height:1.5;white-space:normal;text-align:left}.manual th{position:sticky;top:0;background:#eaf2f9;z-index:1}.manual code{white-space:nowrap}.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.flow div{background:#fff;border:1px solid #dce4ec;border-radius:8px;padding:12px}.danger{background:#fff0f0;border-color:#e8a5a5}@media(max-width:800px){.manual{padding:10px}.flow{grid-template-columns:1fr}}@media print{.manual{max-width:none;padding:0}.no-print{display:none!important}.manual th{position:static}.manual table{min-width:0;font-size:8px}.manual td,.manual th{padding:4px}}
</style></head><body><main class="manual">
<div class="manual-head"><div><h1>解析パラメータ説明マニュアル</h1><p>Bread Research Analyzer Version 10.5.5 / Python OpenCV</p></div><div class="no-print"><button onclick="window.print()">印刷・PDF保存</button> <button onclick="location.href='index.php#analyze'">解析画面へ戻る</button></div></div>
<section class="card"><h2>パン輪郭内を解析する手順</h2><ol><li>「気泡を調べる範囲」で「パン輪郭内」を選び、画像を1枚選択します。</li><li>「パン輪郭を自動検出」を押します。緑色の範囲がパン面積です。</li><li>不足部分は「パン領域を追加」、背景の混入は「背景として削除」を選び、画像上をドラッグして修正します。</li><li>DPIと推定面積を確認し、「選択画像を解析して保存」を押します。修正済みマスクも保存され、再解析時に読み込まれます。</li></ol><p>パン輪郭の縁から「境界除外幅」だけ内側を気泡解析に使用します。パン面積そのものは、除外前の輪郭マスク全体から計算します。</p></section>
<section class="card"><h2>推奨する調整順序</h2><div class="flow"><div><b>1. 実寸</b><br>DPI、ROI、縮小上限を確定</div><div><b>2. 候補抽出</b><br>CLAHE、二値化、C値を調整</div><div><b>3. 輪郭整理</b><br>形態処理、Distance、Watershed</div><div><b>4. 採用条件</b><br>面積・形状・分類を固定</div></div></section>
<section class="card danger"><h2>異常結果</h2><ul><li>空洞数1、空洞率約100%、ROI全体が赤い結果は異常です。</li><li>「大空洞補完」を不使用にし、<code>large_hole_mask</code>を確認してください。</li><li>異常データは統計から除外し、条件修正後に再解析してください。</li></ul></section>
<section class="card"><h2>全パラメータ一覧</h2><div class="table-wrap"><table><thead><tr><th>画面項目</th><th>保存キー</th><th>標準値</th><th>役割</th><th>下げる／不使用</th><th>上げる／使用</th><th>推奨・注意</th></tr></thead><tbody><?php foreach($rows as $r): ?><tr><?php foreach($r as $i=>$cell): ?><td><?= $i===1?'<code>'.htmlspecialchars($cell,ENT_QUOTES,'UTF-8').'</code>':htmlspecialchars($cell,ENT_QUOTES,'UTF-8') ?></td><?php endforeach; ?></tr><?php endforeach; ?></tbody></table></div></section>
<section class="card"><h2>研究用途で記録する項目</h2><p>解析日時、アプリ版、アルゴリズム版、DPI、解析範囲方式、ROIまたは修正済みパン輪郭マスク、縮小率、プリセット名、全パラメータ、元画像名を保存します。群比較では同一条件を使用し、途中で条件を変更した場合は別の解析バージョンとして扱います。</p></section>
</main></body></html>
