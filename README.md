# Bread Research Analyzer Version 10.4

Xserver共有サーバー上のPython版OpenCVを利用する、パン断面画像解析・研究支援システムです。

## Version 10.4の追加機能

- データ一覧で選択したデータの所属試験区とサンプル名を編集
- 複数データを一つの編集表で個別に修正し、一括保存
- 試験区が対象データと同じ試験に属することをサーバー側で検証
- 一度に最大500件まで更新
- 解析値、画像、ROI、空洞詳細、履歴は変更せず名称と所属だけを更新

## Version 10.3の追加機能

- 解析画面から開ける「解析パラメータ説明マニュアル」を追加
- 全31項目について役割、値を下げた場合、上げた場合、推奨値、注意点を掲載
- 推奨する調整順序と異常結果の判定方法を掲載
- ブラウザ印刷からPDFとして保存可能

## Version 10.2.1の修正

- 大空洞補完マスクがROI全体で連結し、空洞1個・空洞率約100%になる問題を修正
- 補完処理にはCLAHE画像ではなく、平滑化した原グレースケール画像を使用
- ROI境界に接する候補、占有率が大きすぎる候補、外接矩形が広すぎる候補を除外
- `大空洞候補最大占有率`を追加（標準5%）
- 大空洞コントラストの標準値を12へ調整

## Version 10.2の修正

- 適応二値化で消えやすい、明暗差の弱い大空洞をBlack-hat処理で補完
- 大空洞補完マスクをWatershed後のマスクへ統合し、広い空洞の輪郭を維持
- `大空洞検出窓`、`大空洞コントラスト`、`大空洞候補最小面積`を画面から調整可能
- 中空洞から大空洞へ切り替わる標準円相当径を5 mmから4 mmへ変更
- Pythonが返した解析アルゴリズム版を解析条件へ正確に保存

大空洞をさらに拾いたい場合は`大空洞コントラスト`を8から6へ下げます。パン組織の影まで拾う場合は10～15へ上げます。`大空洞検出窓`は対象空洞より大きくし、通常は61～101 pxを使用します。条件変更後は中間画像の`large_hole_mask`を確認してください。

## Version 10.1.1の修正

- JPEG写真を巨大なPNGへ変換せず、元のJPEGデータのまま送信するように変更
- 解析用ROIは高品質JPEGにして送信容量を削減
- 10MBを超える元画像は、縦横サイズを維持してJPEG圧縮
- サーバー応答が空またはJSON以外の場合、HTTP状態・送信容量・確認項目を表示
- PHPがリクエスト本文を受信できなかった場合、容量制限を示すJSONエラーを返す

## Version 10.1の追加機能

- データ一覧のチェックボックスから任意のサンプルを統計対象として選択
- ページ移動・検索・ソート後も選択状態を保持
- 検索結果の一括選択と選択解除
- 試験区別の平均、中央値、標準偏差、分散、CV、95%信頼区間、最小・最大
- Welchのt検定、一元配置分散分析、Kruskal–Wallis検定
- 全試験区間のWelch t検定とHolm法による多重比較補正
- 平均値、95%信頼区間、個別値、有意差文字を表示するグラフ
- 統計結果・ペア比較・元データのExcel出力
- ブラウザの印刷機能を利用したPDF保存

統計対象は「データ一覧で選択したデータ」「試験内の最新版すべて」「試験内の全履歴」から選択できます。標準は、再解析データを重複集計しない「最新版すべて」です。

## 対応環境

- PHP 8.3
- MySQL / MariaDB
- Python 3.6.8
- pip 21.3.1
- NumPy 1.19.5
- OpenCV 4.5.5.64（`cv2.__version__` は 4.5.5）
- Python仮想環境: `/home/a-pages/python/venv`

## Version 10の解析構成

ブラウザで画像とROIを準備し、`api.php?action=analyze_python`へ送信します。PHPは一時画像を保存して、次のPythonを実行します。

```text
/home/a-pages/python/venv/bin/python python/analyze.py
```

PythonはCLAHE、Gaussian Blur、Adaptive Threshold、Morphology、Distance Transform、Connected Components、Watershed、輪郭抽出を行い、JSONと解析画像を返します。PHPは解析結果、パラメータ、ROI、アルゴリズム版をMySQLへ保存します。

OpenCV.jsとWeb WorkerはVersion 10では使用しません。`assets/opencv-worker.js`はVersion 9.1からの参照用として同梱していますが、削除してもVersion 10は動作します。

## Xserverへの更新方法

1. 現在のWebアプリとデータベースをバックアップします。
2. Version 10.1のファイルをWebアプリの設置先へ上書きします。
3. 既存の`config.php`、`uploads/original`、`uploads/result`は削除しないでください。
4. `config.sample.php`を参考に、既存の`config.php`へ`python`設定を追加します。
5. ログイン後、「画像解析」画面の「Python環境を再診断」を押します。
6. Python 3.6.8、OpenCV 4.5.5、NumPy 1.19.5が表示されたら解析できます。

Version 10から10.1へ更新する場合は、少なくとも次のファイルを転送してください。データベース変更はありません。

- `api.php`
- `index.php`
- `assets/app.js`
- `assets/style.css`
- `assets/vendor/xlsx.full.min.js`
- `assets/vendor/LICENSE-xlsx.txt`

## 任意データを選んで統計処理する手順

1. 「データ一覧」で試験を選びます。
2. 統計に使う行の左端へチェックを付けます。検索結果をまとめて選ぶこともできます。
3. 「選択したデータを統計処理」を押します。
4. 比較項目と有意水準を確認し、「集計・検定」を押します。
5. 必要に応じてExcel出力、またはブラウザの印刷画面からPDF保存します。

試験を変更すると選択は解除されます。同じ試験内では検索、ソート、ページ移動を行っても選択状態を保持します。

追加する設定は次のとおりです。

```php
'app_version' => '10.4.0',
'python' => [
    'binary' => '/home/a-pages/python/venv/bin/python',
    'script' => __DIR__ . '/python/analyze.py',
    'timeout_seconds' => 180,
],
```

## SSHからの単独診断

Webアプリの設置ディレクトリへ移動して、次を実行します。

```bash
/home/a-pages/python/venv/bin/python python/analyze.py --diagnose
```

正常時は、Python、OpenCV、NumPy、解析アルゴリズムのバージョンを含むJSONが1行表示されます。

## 保存先

- 元画像: `uploads/original/`
- 解析結果: `uploads/result/`
- 中間画像: `uploads/intermediate/`
- 一時画像: `uploads/tmp/`（解析後に自動削除）

一時画像ディレクトリは`.htaccess`で外部アクセスを拒否します。`python`ディレクトリもWebから直接取得できないように設定しています。

## データベース

Version 9.1と同じテーブルを使用するため、Version 9.1からの更新では追加SQLは不要です。新規設置の場合だけ`schema.sql`を実行してください。

解析条件の`parameter_json`には次の情報も記録されます。

- `engine`: Python OpenCV 4.5.5
- `algorithm_version`: 10.0.0-python
- `scale`: ROI画像の解析縮小率

## PHP実行機能について

Version 10はPHPの`proc_open`からPythonを呼び出し、利用できない場合は`exec`へ切り替えます。「Python環境を再診断」で外部プログラム実行に関するエラーが表示された場合は、Xserver側でこれらのPHP関数が利用可能か確認してください。`exec`使用時はPHP側の独自タイムアウト制御が働かないため、可能なら`proc_open`を利用します。

ブラウザでキャンセルした場合、通信は中断されますが、すでに開始したサーバー側Python処理は完了まで続く場合があります。

## 主なファイル

- `index.php`: 画面
- `api.php`: 認証、DB操作、Python起動、結果保存
- `python/analyze.py`: Python OpenCV解析エンジン
- `assets/app.js`: ROI、送信、結果表示、データ管理
- `config.sample.php`: 設定例
- `schema.sql`: 新規導入用DB定義
