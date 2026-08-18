<?php
$configFile = __DIR__ . '/config.php';
$appName = 'パン断面 研究解析システム';
if (file_exists($configFile)) {
    $c = require $configFile;
    $appName = $c['app_name'] ?? $appName;
}
?><!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></title>
<link rel="stylesheet" href="assets/style.css?v=10.6.0">
</head>
<body>
<div id="loginView" class="center-card hidden">
  <h1><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></h1>
  <p>研究データ管理画面へログイン</p>
  <input id="loginPassword" type="password" placeholder="パスワード">
  <button id="loginButton" class="primary">ログイン</button>
  <div id="loginError" class="error"></div>
</div>

<div id="appView" class="hidden">
<header>
  <div><h1><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></h1><small>PHP + MySQL + Python OpenCV Version 10.6.0</small></div>
  <button id="logoutButton">ログアウト</button>
</header>

<nav id="tabs">
  <button data-tab="dashboard" class="active">ダッシュボード</button>
  <button data-tab="manage">試験管理</button>
  <button data-tab="analyze">画像解析</button>
  <button data-tab="data">データ一覧</button>
  <button data-tab="stats">集計・統計比較</button>
</nav>
<script>
// タブ切替はOpenCV・Chart・PDF等から独立して必ず動作させる
(function () {
  function switchTab(name) {
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.id !== 'tab-' + name);
    });
    try { history.replaceState(null, '', '#'+name); } catch (_) {}
    document.dispatchEvent(new CustomEvent('bread:tabchange', {detail:{tab:name}}));
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('#tabs button[data-tab]');
    if (!button) return;
    event.preventDefault();
    switchTab(button.dataset.tab);
  });
  window.breadSwitchTab = switchTab;
  document.addEventListener('DOMContentLoaded', function () {
    var requested=(location.hash||'').replace('#','');
    var valid=['dashboard','manage','analyze','data','stats'];
    switchTab(valid.indexOf(requested)>=0 ? requested : 'dashboard');
  });
})();
</script>

<main>
<section id="tab-dashboard" class="tab-panel">
  <div class="metric-grid" id="dashboardMetrics"></div>
  <div class="grid2">
    <div class="card"><h2>研究テーマ別状況</h2><div class="table-wrap"><table id="dashboardExperiments"></table></div></div>
    <div class="card"><h2>最近の解析</h2><div class="table-wrap"><table id="dashboardRecent"></table></div></div>
  </div>
</section>

<section id="tab-manage" class="tab-panel hidden">
  <div class="grid2">
    <div class="card">
      <h2>試験登録</h2>
      <label>試験名<input id="expName"></label>
      <label>研究目的<textarea id="expObjective"></textarea></label>
      <label>研究者・担当者<input id="expResearcher"></label>
      <label>所属<input id="expInstitution"></label>
      <label>開始日<input id="expStartDate" type="date"></label>
      <label>備考<textarea id="expNotes"></textarea></label>
      <button id="createExperiment" class="primary">試験を登録</button>
    </div>
    <div class="card">
      <h2>試験区登録</h2>
      <label>試験<select id="treatExperiment"></select></label>
      <label>試験区名<input id="treatName" placeholder="対照区、米粉10%区など"></label>
      <label>表示順<input id="treatOrder" type="number" value="1"></label>
      <label>説明<textarea id="treatDescription"></textarea></label>
      <button id="createTreatment" class="primary">試験区を追加</button>
    </div>
  </div>
  <div class="card"><h2>登録済み試験</h2><div class="table-wrap"><table id="experimentTable"></table></div></div>
</section>

<section id="tab-analyze" class="tab-panel hidden">
  <div id="analysisStatus" class="notice">
      <b>Python OpenCV解析版です。</b><br>
      Xserver上のPython仮想環境で解析します。ブラウザへのOpenCV.js読み込みは不要です。
      <div class="worker-actions">
        <span class="worker-label">サーバー解析エンジン：</span>
        <span id="workerState" class="worker-state idle">未診断</span>
        <button id="restartWorker">Python環境を再診断</button>
        <button id="cancelAnalysis" disabled>解析をキャンセル</button>
      </div>
      <div id="workerPreparing" class="worker-preparing hidden">
        <span class="spinner"></span>
        <span id="workerPreparingText">Python OpenCVの動作を確認しています。</span>
      </div>
    </div>
  <div class="card">
    <h2>試験・サンプル情報</h2>
    <div class="form-grid">
      <label>試験<select id="analysisExperiment"></select></label>
      <label>試験区<select id="analysisTreatment"></select></label>
      <label>反復<input id="replicateNo"></label>
      <label>パン種類<input id="breadType"></label>
      <label>製造日<input id="productionDate" type="date"></label>
      <label>焼成日<input id="bakingDate" type="date"></label>
      <label>測定日<input id="measurementDate" type="date"></label>
      <label>測定者<input id="operatorName"></label>
      <label class="span2">配合・処理条件<textarea id="formulation"></textarea></label>
      <label class="span2">備考<textarea id="sampleNotes"></textarea></label>
    </div>
  </div>

  <details class="card" open>
    <summary><strong>解析パラメータ</strong></summary>
    <p><a class="button-link" href="parameter_manual.php" target="_blank" rel="noopener">各パラメータの説明マニュアルを開く</a></p>
    <div class="preset-row">
      <label>解析条件プリセット<select id="presetSelect"></select></label>
      <button id="applyPreset">適用</button>
      <input id="presetName" placeholder="新しいプリセット名">
      <button id="savePreset">現在条件を保存</button>
    </div>
    <div class="form-grid params">
<label>DPI<input id="dpi" type="number" value="300"></label>
<label>解析縮小上限(px)<input id="maxDimension" type="number" value="1400"></label>
<label>CLAHE<select id="useClahe"><option value="1" selected>使用</option><option value="0">不使用</option></select></label>
<label>CLAHEクリップ<input id="claheClip" type="number" value="2.0" step="0.1"></label>
<label>CLAHEタイル数<input id="claheTiles" type="number" value="8"></label>
<label>平滑化<input id="blurSize" type="number" value="5" step="2"></label>
<label>二値化<select id="thresholdMode"><option value="adaptive" selected>適応的</option><option value="otsu">大津</option><option value="combined">複合</option></select></label>
<label>固定しきい値<input id="holeThreshold" type="number" value="145"></label>
<label>適応ブロック<input id="adaptiveBlock" type="number" value="41" step="2"></label>
<label>適応C値<input id="adaptiveC" type="number" value="5"></label>
<label>オープニング<input id="openSize" type="number" value="1"></label>
<label>クロージング<input id="closeSize" type="number" value="3"></label>
<label>距離変換<select id="useDistance"><option value="1" selected>使用</option><option value="0">不使用</option></select></label>
<label>距離しきい値比<input id="distanceRatio" type="number" value="0.35" step="0.05"></label>
<label>Watershed<select id="useWatershed"><option value="1" selected>使用</option><option value="0">不使用</option></select></label>
<label>背景膨張回数<input id="backgroundDilate" type="number" value="3"></label>
<label>大空洞補完<select id="useLargeHoleRescue"><option value="1" selected>使用</option><option value="0">不使用</option></select></label>
<label>大空洞検出窓(px)<input id="largeHoleWindow" type="number" value="61" min="9" step="2"></label>
<label>大空洞コントラスト<input id="largeHoleContrast" type="number" value="12" min="1" max="100" step="1"></label>
<label>大空洞候補最小面積(mm²)<input id="largeHoleMinArea" type="number" value="2" min="0" step="0.25"></label>
<label>大空洞候補最大占有率(%)<input id="largeHoleMaxFraction" type="number" value="5" min="0.1" max="25" step="0.5"></label>
<label>境界除外幅(px)<input id="borderMargin" type="number" value="3"></label>
<label>最小面積(mm²)<input id="minArea" type="number" value="0.15" step="0.05"></label>
<label>最大面積(mm²)<input id="maxArea" type="number" value="0"></label>
<label>最小円形度<input id="minCircularity" type="number" value="0" step="0.05"></label>
<label>最大縦横比<input id="maxAspect" type="number" value="20"></label>
<label>小→中境界(mm)<input id="smallLimit" type="number" value="2"></label>
<label>中→大境界(mm)<input id="mediumLimit" type="number" value="4"></label>
<label>輪郭塗りつぶし<select id="fillContours"><option value="1" selected>はい</option><option value="0">いいえ</option></select></label>
<label>空洞番号<select id="showNumbers"><option value="1" selected>表示</option><option value="0">非表示</option></select></label>
<label>中間画像<select id="saveIntermediates"><option value="1" selected>表示</option><option value="0">非表示</option></select></label>
</div>
  </details>

  <div class="card">
    <h2>解析範囲・ROI</h2>
    <div class="scope-selector"><label>気泡を調べる範囲<select id="analysisScope"><option value="rectangle" selected>矩形ROI（従来方式）</option><option value="bread">パン輪郭内（パン面積を自動計測）</option></select></label></div>
    <p>
      矩形ROIでは従来どおり一定範囲を比較します。パン輪郭内では背景とパンの境界を自動検出し、手動修正した輪郭内だけを解析します。
    </p>
    <div class="roi-controls">
      <label>ROI幅 W（px）
        <input id="roiWidth" type="number" value="600" min="20" step="10">
      </label>
      <label>ROI高さ H（px）
        <input id="roiHeight" type="number" value="400" min="20" step="10">
      </label>
      <label>ROI位置 X（px）
        <input id="roiX" type="number" value="0" min="0" step="1">
      </label>
      <label>ROI位置 Y（px）
        <input id="roiY" type="number" value="0" min="0" step="1">
      </label>
      <button id="showRoiImage">画像を表示・ROIを設定</button>
      <button id="centerRoi">ROIを中央へ</button>
      <button id="applyRoiNumbers">数値を反映</button>
      <button id="clearRoi">ROIを解除</button>
    </div>
    <div id="roiInfo" class="notice">ROI未指定</div>
    <div class="roi-wrap"><canvas id="roiCanvas"></canvas></div>
    <p class="small-note">
      黄色い矩形の内側をドラッグすると、W・Hを変えずに位置だけ移動します。
      W・HまたはX・Yを変更した場合は「数値を反映」を押してください。
    </p>
    <div id="breadMaskControls" class="bread-mask-controls hidden">
      <button id="detectBreadMask" class="primary">パン輪郭を自動検出</button>
      <span id="breadMaskStatus">最初の画像からパン輪郭を検出します。</span>
      <div id="breadMaskEditor" class="hidden">
        <div class="mask-toolbar">
          <button id="breadMaskAdd" class="active">パン領域を追加</button>
          <button id="breadMaskRemove">背景として削除</button>
          <label>ブラシ半径(px)<input id="breadMaskBrush" type="number" value="25" min="2" max="200"></label>
          <button id="resetBreadMask">自動検出へ戻す</button>
        </div>
        <div class="bread-mask-stage"><canvas id="breadSourceCanvas"></canvas><canvas id="breadMaskOverlayCanvas"></canvas></div>
        <p class="small-note">緑色がパン面積として保存される範囲です。ドラッグして追加・削除できます。</p>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>画像選択</h2>
    <input id="imageFiles" type="file" accept="image/png,image/jpeg,image/tiff,image/bmp" multiple>
    <button id="runAnalysis" class="primary">選択画像を解析して保存</button>
    <div id="progressShell" class="progress-shell"><div id="analysisProgressBar"></div></div>
    <div id="analysisProgress"></div>
  </div>
  <div id="analysisResults"></div>
  <div id="manualEditPanel" class="card hidden">
    <h2>手動補正</h2>
    <p>解析画像上をクリックして補正します。左クリックで空洞を追加、右クリックで空洞を削除します。</p>
    <div class="manual-controls">
      <label>ブラシ半径(px)<input id="editBrushRadius" type="number" value="12" min="2" max="100"></label>
      <button id="saveManualCorrection" class="primary">手動補正を保存</button>
      <button id="resetManualCorrection">補正をリセット</button>
    </div>
    <canvas id="editCanvas"></canvas>
    <div id="manualEditStatus"></div>
  </div>
</section>

<section id="tab-data" class="tab-panel hidden">
  <div class="card">
    <h2>サンプル一覧</h2>
    <div class="datatable-toolbar">
      <label>試験<select id="dataExperiment"></select></label>
      <label>全文検索<input id="dataSearch" type="search" placeholder="試験区、サンプル、日付など"></label>
      <label>表示件数
        <select id="dataPageSize">
          <option value="20">20件</option>
          <option value="50" selected>50件</option>
          <option value="100">100件</option>
          <option value="all">全件</option>
        </select>
      </label>
      <details class="column-picker">
        <summary>表示列</summary>
        <div id="columnPickerList"></div>
      </details>
      <button id="resetDataTable">表示を初期化</button>
      <button id="exportSamplesCsv">表示中CSV</button>
      <button id="exportSamplesXlsx">表示中Excel</button>
    </div>
    <div class="selection-toolbar">
      <strong id="selectedSampleCount">選択データ：0件</strong>
      <button id="selectFilteredSamples">検索結果をすべて選択</button>
      <button id="clearSelectedSamples">選択をすべて解除</button>
      <button id="editSelectedSamples" disabled>選択データの名称・試験区を修正</button>
      <button id="analyzeSelectedSamples" class="primary" disabled>選択したデータを統計処理</button>
    </div>
    <p class="small-note">表の左端にチェックを付けて編集・統計処理の対象を選択します。ページを移動しても選択は保持されます。試験を変更すると選択は解除されます。</p>
    <div id="dataTableInfo" class="datatable-info"></div>
    <div class="table-wrap"><table id="samplesTable" class="datatable"></table></div>
    <div class="datatable-footer">
      <button id="dataPrevPage">前へ</button>
      <span id="dataPageIndicator"></span>
      <button id="dataNextPage">次へ</button>
    </div>
  </div>
  <div id="selectedSampleEditPanel" class="card hidden">
    <div class="panel-title-row"><div><h2>選択データの名称・所属試験区を修正</h2><p class="small-note">各行ごとに所属試験区とサンプル名を変更できます。解析値・画像・空洞詳細は変更されません。</p></div><button id="closeSelectedSampleEditor">閉じる</button></div>
    <div class="table-wrap"><table id="selectedSampleEditTable"></table></div>
    <div class="editor-actions"><button id="saveSelectedSampleEdits" class="primary">変更を保存</button><span id="selectedSampleEditStatus"></span></div>
  </div>
  <div id="savedAnalysisPanel" class="card hidden">
    <div class="panel-title-row">
      <h2>保存済み解析の表示</h2>
      <button id="closeSavedAnalysis">閉じる</button>
    </div>
    <div id="savedAnalysisMeta"></div>
    <div id="savedAnalysisMetrics" class="metric-grid"></div>
    <div class="image-visibility-toolbar"><label class="inline-check"><input id="savedOriginalToggle" class="original-visibility-toggle" type="checkbox"> 元画像を表示</label></div>
    <div class="result-grid">
      <figure id="savedOriginalFigure" class="original-result-figure hidden">
        <img id="savedOriginalImage" alt="保存済み元画像">
        <figcaption>元画像</figcaption>
      </figure>
      <figure>
        <div class="result-comparison">
          <div class="result-view-controls">
            <label class="result-opacity-control">検出結果の濃度 <input id="savedResultOpacity" class="result-opacity-range" type="range" min="0" max="100" value="60"><output id="savedResultOpacityValue">60%</output></label>
            <label class="result-zoom-control">表示倍率 <input id="savedResultZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedResultZoomValue">100%</output></label>
          </div>
          <div class="result-zoom-viewport"><div id="savedResultOverlayStage" class="result-overlay-stage"><canvas id="savedResultBaseCanvas" class="result-base-image"></canvas><img id="savedResultImage" class="result-overlay-image" alt="保存済み解析画像" style="opacity:.6"></div></div>
        </div>
        <figcaption>解析結果（拡大時は画像内をスクロールできます）</figcaption>
      </figure>
      <figure id="savedBinaryFigure" class="result-comparison hidden">
        <div class="result-view-controls">
          <label class="result-opacity-control">二値化画像の濃度 <input id="savedBinaryOpacity" class="result-opacity-range" type="range" min="0" max="100" value="60"><output id="savedBinaryOpacityValue">60%</output></label>
          <label class="result-zoom-control">表示倍率 <input id="savedBinaryZoom" class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output id="savedBinaryZoomValue">100%</output></label>
        </div>
        <div class="result-zoom-viewport"><div id="savedBinaryStage" class="result-overlay-stage"><canvas id="savedBinaryBaseCanvas" class="result-base-image"></canvas><img id="savedBinaryImage" class="result-overlay-image" alt="保存済み二値化画像" style="opacity:.6"></div></div>
        <figcaption>二値化画像（元画像＋二値化オーバーレイ／白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption>
      </figure>
    </div>
    <details open>
      <summary><strong>保存された解析条件・ROI</strong></summary>
      <div id="savedParameterTable" class="table-wrap"></div>
    </details>
    <div class="saved-actions">
      <button id="restoreForReanalysis" class="primary">この画像・条件を解析画面へ読み込む</button>
      <button id="openSavedManualEditor">この解析画像を手動補正する</button>
    </div>
  </div>
  <div class="card">
    <h2>空洞詳細</h2>
    <div class="table-wrap"><table id="holesTable"></table></div>
  </div>
</section>

<section id="tab-stats" class="tab-panel hidden">
  <div class="card">
    <h2>試験区別集計・統計比較</h2>
    <div class="form-grid">
      <label>試験<select id="statsExperiment"></select></label>
      <label>統計対象<select id="statsSource">
        <option value="latest" selected>試験内の最新版すべて</option>
        <option value="selected">データ一覧で選択したデータ</option>
        <option value="all">試験内の全履歴</option>
      </select></label>
      <label>比較項目<select id="statsMetric">
        <option value="bread_area_mm2">パン断面積(mm²)</option>
        <option value="hole_area_mm2">空洞合計面積(mm²)</option>
        <option value="porosity_percent">空洞率(%)</option>
        <option value="binary_white_area_mm2">二値化白領域（空洞）面積 mm²</option>
        <option value="binary_black_area_mm2">二値化黒領域（生地）面積 mm²</option>
        <option value="binary_white_percent">二値化白領域率 %</option>
        <option value="binary_black_percent">二値化黒領域率 %</option>
        <option value="hole_count">空洞数</option>
        <option value="mean_hole_area_mm2">平均空洞面積(mm²)</option>
        <option value="median_hole_area_mm2">中央値空洞面積(mm²)</option>
        <option value="max_hole_area_mm2">最大空洞面積(mm²)</option>
        <option value="mean_eq_diameter_mm">平均円相当直径(mm)</option>
        <option value="small_hole_count">小空洞数</option>
        <option value="medium_hole_count">中空洞数</option>
        <option value="large_hole_count">大空洞数</option>
      </select></label>
      <label>有意水準 α<input id="alpha" type="number" value="0.05" min="0.001" max="0.2" step="0.01"></label>
    </div>
    <button id="calculateStats" class="primary">集計・検定</button>
    <button id="exportStatsXlsx">Excel形式で出力</button>
    <button id="exportPdfReport">印刷・PDF保存</button>
    <label class="inline-check"><input id="showSignificance" type="checkbox" checked> 有意差記号を表示</label>
    <div id="statsStatus" class="notice">試験と統計対象を選択して「集計・検定」を押してください。</div>
    <div class="chart-box"><canvas id="statsChart"></canvas></div>
    <h3>記述統計</h3><div class="table-wrap"><table id="summaryTable"></table></div>
    <h3>検定結果</h3><div class="table-wrap"><table id="testTable"></table></div>
    <h3>試験区間のペア比較（Welch t検定・Holm補正）</h3>
    <div class="table-wrap"><table id="pairTable"></table></div>
    <p class="notice">統計結果は探索的解析用です。同一パンから複数断面を得た場合、それらを独立反復として扱わないでください。</p>
  </div>
</section>
</main>
</div>

<canvas id="workCanvas" class="hidden"></canvas>
<script defer src="assets/vendor/xlsx.full.min.js"></script>
<script defer src="assets/app.js?v=10.6.0-view3"></script>
</body>
</html>
