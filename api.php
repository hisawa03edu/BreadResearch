<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config.php がありません。']);
    exit;
}
$config = require $configFile;

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($contentLength > 0) {
            respond(['ok'=>false,'error'=>'リクエスト本文を受信できませんでした。画像容量がPHPのpost_max_sizeまたはmemory_limitを超えた可能性があります。送信容量: ' . round($contentLength / 1024 / 1024, 1) . ' MB'],413);
        }
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(['ok'=>false,'error'=>'受信JSONを解析できません: ' . json_last_error_msg()],400);
    }
    return $data;
}
function loggedIn(): bool {
    return !empty($_SESSION['bread_logged_in']);
}
function requireLogin(): void {
    if (!loggedIn()) respond(['ok' => false, 'error' => 'ログインが必要です。'], 401);
}
function db(array $config): PDO {
    $d = $config['db'];
    $dsn = "mysql:host={$d['host']};dbname={$d['name']};charset={$d['charset']}";
    return new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
function saveDataUrl(string $dataUrl, string $dir, string $prefix): ?string {
    if ($dataUrl === '' || !preg_match('#^data:image/(png|jpeg);base64,#', $dataUrl, $m)) return null;
    $ext = $m[1] === 'jpeg' ? 'jpg' : 'png';
    $data = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
    if ($data === false || strlen($data) > 20 * 1024 * 1024) return null;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) return null;
    $name = $prefix . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $path = rtrim($dir, '/') . '/' . $name;
    if (file_put_contents($path, $data) === false) return null;
    return str_replace(__DIR__ . '/', '', $path);
}
function saveDataUrlAbsolute(string $dataUrl, string $dir, string $prefix): string {
    $relative = saveDataUrl($dataUrl, $dir, $prefix);
    if ($relative === null) throw new RuntimeException('解析用画像を保存できません。画像サイズまたは形式を確認してください。');
    return __DIR__ . '/' . $relative;
}
function pythonConfig(array $config): array {
    $p = $config['python'] ?? [];
    return [
        'binary' => (string)($p['binary'] ?? '/home/a-pages/python/venv/bin/python'),
        'script' => (string)($p['script'] ?? (__DIR__ . '/python/analyze.py')),
        'timeout_seconds' => max(10, (int)($p['timeout_seconds'] ?? 180)),
    ];
}
function runPython(array $config, array $arguments): array {
    $p = pythonConfig($config);
    if (!is_file($p['binary']) || !is_executable($p['binary'])) throw new RuntimeException('Python実行ファイルを確認できません: ' . $p['binary']);
    if (!is_file($p['script'])) throw new RuntimeException('Python解析スクリプトがありません: ' . $p['script']);

    $parts = [escapeshellarg($p['binary']), escapeshellarg($p['script'])];
    foreach ($arguments as $argument) $parts[] = escapeshellarg((string)$argument);
    $command = implode(' ', $parts);
    if (!function_exists('proc_open')) {
        if (!function_exists('exec')) throw new RuntimeException('PHPから外部プログラムを実行できません。proc_openまたはexecの利用可否を確認してください。');
        $lines = [];
        $exitCode = -1;
        exec($command . ' 2>&1', $lines, $exitCode);
        $stdout = implode("\n", $lines);
        if ($exitCode !== 0) throw new RuntimeException('Python解析に失敗しました。 ' . substr(trim($stdout), 0, 1000));
        $result = json_decode(trim($stdout), true);
        if (!is_array($result) || empty($result['ok'])) throw new RuntimeException('Pythonから正しい解析結果が返りませんでした。');
        return $result;
    }
    $pipes = [];
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, __DIR__);
    if (!is_resource($process)) throw new RuntimeException('Python解析プロセスを開始できません。');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $stdout = '';
    $stderr = '';
    $started = microtime(true);
    $exitCode = -1;
    while (true) {
        $stdout .= stream_get_contents($pipes[1]);
        $stderr .= stream_get_contents($pipes[2]);
        $status = proc_get_status($process);
        if (!$status['running']) {
            $exitCode = (int)$status['exitcode'];
            break;
        }
        if (microtime(true) - $started > $p['timeout_seconds']) {
            proc_terminate($process, 9);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);
            throw new RuntimeException('Python解析が制限時間を超えました（' . $p['timeout_seconds'] . '秒）。');
        }
        usleep(50000);
    }
    $stdout .= stream_get_contents($pipes[1]);
    $stderr .= stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    if ($exitCode !== 0) {
        $detail = trim($stderr) ?: trim($stdout);
        throw new RuntimeException('Python解析に失敗しました。' . ($detail !== '' ? ' ' . substr($detail, 0, 1000) : ''));
    }
    $result = json_decode(trim($stdout), true);
    if (!is_array($result) || empty($result['ok'])) {
        throw new RuntimeException('Pythonから正しい解析結果が返りませんでした。' . (trim($stderr) !== '' ? ' ' . substr(trim($stderr), 0, 1000) : ''));
    }
    return $result;
}
function resultPublicPath(string $directory, $fileName): string {
    $name = basename((string)$fileName);
    $path = rtrim($directory, '/') . '/' . $name;
    if ($name === '' || !is_file($path)) throw new RuntimeException('Pythonが生成した画像を確認できません。');
    return str_replace(__DIR__ . '/', '', $path);
}
function validateAnalysisResult(array $analysis): void {
    $summary = $analysis['summary'] ?? null;
    $holes = $analysis['holes'] ?? null;
    if (!is_array($summary) || !is_array($holes)) throw new RuntimeException('Python解析結果のデータ形式が不正です。');
    $keys = ['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent',
        'binary_white_area_mm2','binary_black_area_mm2','binary_white_percent','binary_black_percent','mean_hole_area_mm2',
        'median_hole_area_mm2','max_hole_area_mm2','mean_eq_diameter_mm','small_hole_count',
        'medium_hole_count','large_hole_count'];
    foreach ($keys as $key) {
        if (!array_key_exists($key, $summary) || !is_numeric($summary[$key])) {
            throw new RuntimeException('Python解析結果に不足があります: ' . $key);
        }
    }
}
function insertAnalysis(PDO $pdo, array $config, array $input, ?string $originalPath, ?string $resultPath, ?string $breadMaskPath = null): array {
    $required = ['experiment_id','treatment_id','sample_code','dpi','summary','parameters'];
    foreach ($required as $key) if (!array_key_exists($key, $input)) throw new InvalidArgumentException("不足項目: {$key}");
    $processedAt = date('Y-m-d H:i:s');
    $s = $input['summary'];
    $m = $input['metadata'] ?? [];
    $pdo->beginTransaction();
    $sql = "INSERT INTO samples(
        experiment_id,treatment_id,sample_code,replicate_no,bread_type,formulation,
        production_date,baking_date,measurement_date,operator_name,notes,original_filename,
        processed_at,dpi,parameter_json,bread_area_mm2,hole_count,hole_area_mm2,
        porosity_percent,binary_white_area_mm2,binary_black_area_mm2,binary_white_percent,binary_black_percent,
        mean_hole_area_mm2,median_hole_area_mm2,max_hole_area_mm2,
        mean_eq_diameter_mm,small_hole_count,medium_hole_count,large_hole_count,
        original_image_path,result_image_path,bread_mask_path,app_version,parent_sample_id,revision_no,roi_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    $st = $pdo->prepare($sql);
    $st->execute([
        (int)$input['experiment_id'], (int)$input['treatment_id'], (string)$input['sample_code'],
        $m['replicate_no'] ?? '', $m['bread_type'] ?? '', $m['formulation'] ?? '',
        ($m['production_date'] ?? '') ?: null, ($m['baking_date'] ?? '') ?: null,
        ($m['measurement_date'] ?? '') ?: null, $m['operator_name'] ?? '', $m['notes'] ?? '',
        $input['original_filename'] ?? '', $processedAt, (float)$input['dpi'],
        json_encode($input['parameters'], JSON_UNESCAPED_UNICODE),
        (float)$s['bread_area_mm2'], (int)$s['hole_count'], (float)$s['hole_area_mm2'],
        (float)$s['porosity_percent'],
        isset($s['binary_white_area_mm2']) ? (float)$s['binary_white_area_mm2'] : null,
        isset($s['binary_black_area_mm2']) ? (float)$s['binary_black_area_mm2'] : null,
        isset($s['binary_white_percent']) ? (float)$s['binary_white_percent'] : null,
        isset($s['binary_black_percent']) ? (float)$s['binary_black_percent'] : null,
        (float)$s['mean_hole_area_mm2'],
        (float)$s['median_hole_area_mm2'], (float)$s['max_hole_area_mm2'],
        (float)$s['mean_eq_diameter_mm'], (int)$s['small_hole_count'],
        (int)$s['medium_hole_count'], (int)$s['large_hole_count'],
        $originalPath, $resultPath, $breadMaskPath, $config['app_version'],
        ($input['parent_sample_id'] ?? null) ?: null, (int)($input['revision_no'] ?? 1),
        json_encode($input['roi'] ?? null, JSON_UNESCAPED_UNICODE)
    ]);
    $sampleId = (int)$pdo->lastInsertId();
    $holeSt = $pdo->prepare("INSERT INTO holes(
        sample_id,hole_number,area_mm2,eq_diameter_mm,width_mm,height_mm,perimeter_mm,
        circularity,aspect_ratio,size_class,center_x_px,center_y_px
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    foreach (($input['holes'] ?? []) as $h) {
        $holeSt->execute([
            $sampleId,(int)$h['hole_number'],(float)$h['area_mm2'],(float)$h['eq_diameter_mm'],
            (float)$h['width_mm'],(float)$h['height_mm'],(float)$h['perimeter_mm'],
            (float)$h['circularity'],(float)$h['aspect_ratio'],(string)$h['size_class'],
            (int)$h['center_x_px'],(int)$h['center_y_px']
        ]);
    }
    $pdo->commit();
    return ['sample_id' => $sampleId, 'processed_at' => $processedAt];
}

function statsMean(array $values): float {
    return count($values) ? array_sum($values) / count($values) : 0.0;
}
function statsQuantile(array $sorted, float $probability): ?float {
    $n = count($sorted);
    if (!$n) return null;
    if ($n === 1) return (float)$sorted[0];
    $position = max(0.0, min(1.0, $probability)) * ($n - 1);
    $lower = (int)floor($position);
    $upper = (int)ceil($position);
    if ($lower === $upper) return (float)$sorted[$lower];
    $weight = $position - $lower;
    return (float)$sorted[$lower] * (1.0 - $weight) + (float)$sorted[$upper] * $weight;
}
function statsLogGamma(float $z): float {
    $coefficients = [676.5203681218851,-1259.1392167224028,771.32342877765313,
        -176.61502916214059,12.507343278686905,-0.13857109526572012,
        0.0000099843695780195716,0.00000015056327351493116];
    if ($z < 0.5) return log(M_PI) - log(sin(M_PI * $z)) - statsLogGamma(1.0 - $z);
    $z -= 1.0;
    $x = 0.99999999999980993;
    foreach ($coefficients as $i => $coefficient) $x += $coefficient / ($z + $i + 1.0);
    $t = $z + count($coefficients) - 0.5;
    return 0.5 * log(2.0 * M_PI) + ($z + 0.5) * log($t) - $t + log($x);
}
function statsBetaFraction(float $a, float $b, float $x): float {
    $maxIterations = 200;
    $epsilon = 3.0e-14;
    $tiny = 1.0e-300;
    $qab = $a + $b;
    $qap = $a + 1.0;
    $qam = $a - 1.0;
    $c = 1.0;
    $d = 1.0 - $qab * $x / $qap;
    if (abs($d) < $tiny) $d = $tiny;
    $d = 1.0 / $d;
    $h = $d;
    for ($m = 1; $m <= $maxIterations; $m++) {
        $m2 = 2 * $m;
        $aa = $m * ($b - $m) * $x / (($qam + $m2) * ($a + $m2));
        $d = 1.0 + $aa * $d;
        if (abs($d) < $tiny) $d = $tiny;
        $c = 1.0 + $aa / $c;
        if (abs($c) < $tiny) $c = $tiny;
        $d = 1.0 / $d;
        $h *= $d * $c;
        $aa = -($a + $m) * ($qab + $m) * $x / (($a + $m2) * ($qap + $m2));
        $d = 1.0 + $aa * $d;
        if (abs($d) < $tiny) $d = $tiny;
        $c = 1.0 + $aa / $c;
        if (abs($c) < $tiny) $c = $tiny;
        $d = 1.0 / $d;
        $delta = $d * $c;
        $h *= $delta;
        if (abs($delta - 1.0) < $epsilon) break;
    }
    return $h;
}
function statsRegularizedBeta(float $x, float $a, float $b): float {
    if ($x <= 0.0) return 0.0;
    if ($x >= 1.0) return 1.0;
    $front = exp(statsLogGamma($a + $b) - statsLogGamma($a) - statsLogGamma($b)
        + $a * log($x) + $b * log(1.0 - $x));
    if ($x < ($a + 1.0) / ($a + $b + 2.0)) return $front * statsBetaFraction($a, $b, $x) / $a;
    return 1.0 - $front * statsBetaFraction($b, $a, 1.0 - $x) / $b;
}
function statsStudentTwoSidedP(float $t, float $degreesOfFreedom): float {
    if ($degreesOfFreedom <= 0.0) return 1.0;
    $x = $degreesOfFreedom / ($degreesOfFreedom + $t * $t);
    return max(0.0, min(1.0, statsRegularizedBeta($x, $degreesOfFreedom / 2.0, 0.5)));
}
function statsTCritical(float $alpha, float $degreesOfFreedom): float {
    $low = 0.0;
    $high = 1.0;
    while (statsStudentTwoSidedP($high, $degreesOfFreedom) > $alpha && $high < 1000000.0) $high *= 2.0;
    for ($i = 0; $i < 80; $i++) {
        $middle = ($low + $high) / 2.0;
        if (statsStudentTwoSidedP($middle, $degreesOfFreedom) > $alpha) $low = $middle;
        else $high = $middle;
    }
    return ($low + $high) / 2.0;
}
function statsFUpperP(float $f, float $df1, float $df2): float {
    if ($f <= 0.0 || $df1 <= 0.0 || $df2 <= 0.0) return 1.0;
    $x = ($df1 * $f) / ($df1 * $f + $df2);
    return max(0.0, min(1.0, 1.0 - statsRegularizedBeta($x, $df1 / 2.0, $df2 / 2.0)));
}
function statsGammaQ(float $a, float $x): float {
    if ($x <= 0.0) return 1.0;
    $epsilon = 3.0e-14;
    if ($x < $a + 1.0) {
        $sum = 1.0 / $a;
        $term = $sum;
        $ap = $a;
        for ($n = 1; $n <= 200; $n++) {
            $ap += 1.0;
            $term *= $x / $ap;
            $sum += $term;
            if (abs($term) < abs($sum) * $epsilon) break;
        }
        $p = $sum * exp(-$x + $a * log($x) - statsLogGamma($a));
        return max(0.0, min(1.0, 1.0 - $p));
    }
    $tiny = 1.0e-300;
    $b = $x + 1.0 - $a;
    $c = 1.0 / $tiny;
    $d = 1.0 / $b;
    $h = $d;
    for ($i = 1; $i <= 200; $i++) {
        $an = -$i * ($i - $a);
        $b += 2.0;
        $d = $an * $d + $b;
        if (abs($d) < $tiny) $d = $tiny;
        $c = $b + $an / $c;
        if (abs($c) < $tiny) $c = $tiny;
        $d = 1.0 / $d;
        $delta = $d * $c;
        $h *= $delta;
        if (abs($delta - 1.0) < $epsilon) break;
    }
    return max(0.0, min(1.0, exp(-$x + $a * log($x) - statsLogGamma($a)) * $h));
}
function statsDescribe(array $values, float $alpha): array {
    sort($values, SORT_NUMERIC);
    $n = count($values);
    $mean = statsMean($values);
    $variance = null;
    $sd = null;
    $se = null;
    $ciLow = null;
    $ciHigh = null;
    if ($n >= 2) {
        $sumSquares = 0.0;
        foreach ($values as $value) $sumSquares += ($value - $mean) * ($value - $mean);
        $variance = $sumSquares / ($n - 1);
        $sd = sqrt(max(0.0, $variance));
        $se = $sd / sqrt($n);
        $critical = statsTCritical($alpha, $n - 1);
        $ciLow = $mean - $critical * $se;
        $ciHigh = $mean + $critical * $se;
    }
    return [
        'n'=>$n,'mean'=>$mean,'median'=>statsQuantile($values,0.5),'sd'=>$sd,'variance'=>$variance,
        'se'=>$se,'cv_percent'=>($sd !== null && abs($mean) > 1.0e-15) ? $sd / abs($mean) * 100.0 : null,
        'ci_low'=>$ciLow,'ci_high'=>$ciHigh,'min'=>$n ? (float)$values[0] : null,
        'q1'=>statsQuantile($values,0.25),'q3'=>statsQuantile($values,0.75),'max'=>$n ? (float)$values[$n-1] : null,
    ];
}
function statsWelch(array $a, array $b): array {
    $n1 = count($a); $n2 = count($b);
    if ($n1 < 2 || $n2 < 2) return ['t'=>null,'df'=>null,'p'=>null,'difference'=>statsMean($a)-statsMean($b)];
    $m1 = statsMean($a); $m2 = statsMean($b);
    $ss1 = 0.0; foreach ($a as $value) $ss1 += ($value-$m1)*($value-$m1);
    $ss2 = 0.0; foreach ($b as $value) $ss2 += ($value-$m2)*($value-$m2);
    $v1 = $ss1 / ($n1-1); $v2 = $ss2 / ($n2-1);
    $part1 = $v1/$n1; $part2 = $v2/$n2; $se2 = $part1+$part2;
    if ($se2 <= 1.0e-30) return ['t'=>0.0,'df'=>(float)($n1+$n2-2),'p'=>abs($m1-$m2)<1.0e-15?1.0:0.0,'difference'=>$m1-$m2];
    $t = ($m1-$m2)/sqrt($se2);
    $denominator = ($part1*$part1)/($n1-1) + ($part2*$part2)/($n2-1);
    $df = $denominator > 0.0 ? ($se2*$se2)/$denominator : (float)($n1+$n2-2);
    return ['t'=>$t,'df'=>$df,'p'=>statsStudentTwoSidedP($t,$df),'difference'=>$m1-$m2];
}
function statsAnova(array $groups): array {
    $all = []; foreach ($groups as $values) foreach ($values as $value) $all[]=$value;
    $k = count($groups); $totalN = count($all);
    if ($k < 2 || $totalN <= $k) return ['f'=>null,'df1'=>max(0,$k-1),'df2'=>max(0,$totalN-$k),'p'=>null];
    $grandMean = statsMean($all); $between = 0.0; $within = 0.0;
    foreach ($groups as $values) {
        $mean = statsMean($values);
        $between += count($values)*($mean-$grandMean)*($mean-$grandMean);
        foreach ($values as $value) $within += ($value-$mean)*($value-$mean);
    }
    $df1=$k-1; $df2=$totalN-$k;
    if ($within <= 1.0e-30) return ['f'=>0.0,'df1'=>$df1,'df2'=>$df2,'p'=>$between<=1.0e-30?1.0:0.0];
    $f=($between/$df1)/($within/$df2);
    return ['f'=>$f,'df1'=>$df1,'df2'=>$df2,'p'=>statsFUpperP($f,$df1,$df2)];
}
function statsKruskalWallis(array $groups): array {
    $items=[];
    foreach ($groups as $groupIndex=>$values) foreach ($values as $value) $items[]=['value'=>$value,'group'=>$groupIndex];
    usort($items,fn($a,$b)=>$a['value']<=>$b['value']);
    $n=count($items); $rankSums=array_fill(0,count($groups),0.0); $tieSum=0.0;
    $i=0;
    while($i<$n){$j=$i+1;while($j<$n&&abs($items[$j]['value']-$items[$i]['value'])<1.0e-12)$j++;
        $averageRank=(($i+1)+$j)/2.0;$tie=$j-$i;if($tie>1)$tieSum+=$tie*$tie*$tie-$tie;
        for($q=$i;$q<$j;$q++)$rankSums[$items[$q]['group']]+=$averageRank;$i=$j;}
    if($n<2||count($groups)<2)return ['h'=>null,'df'=>max(0,count($groups)-1),'p'=>null];
    $h=0.0;foreach($groups as $index=>$values){if(count($values))$h+=($rankSums[$index]*$rankSums[$index])/count($values);}
    $h=12.0/($n*($n+1.0))*$h-3.0*($n+1.0);
    $correction=1.0-$tieSum/($n*$n*$n-$n);
    if($correction>0.0)$h/=$correction;else $h=0.0;
    $df=count($groups)-1;
    return ['h'=>$h,'df'=>$df,'p'=>statsGammaQ($df/2.0,$h/2.0)];
}
function statsHolmPairs(array $groupRows, float $alpha): array {
    $pairs=[];
    for($i=0;$i<count($groupRows);$i++)for($j=$i+1;$j<count($groupRows);$j++){
        $test=statsWelch($groupRows[$i]['values'],$groupRows[$j]['values']);
        $pairs[]=['group1_id'=>$groupRows[$i]['treatment_id'],'group1'=>$groupRows[$i]['name'],
            'group2_id'=>$groupRows[$j]['treatment_id'],'group2'=>$groupRows[$j]['name'],
            'difference'=>$test['difference'],'t'=>$test['t'],'df'=>$test['df'],'raw_p'=>$test['p'],
            'holm_p'=>null,'significant'=>false];
    }
    $valid=[];foreach($pairs as $index=>$pair)if($pair['raw_p']!==null)$valid[]=['index'=>$index,'p'=>$pair['raw_p']];
    usort($valid,fn($a,$b)=>$a['p']<=>$b['p']);$m=count($valid);$previous=0.0;
    foreach($valid as $rank=>$entry){$adjusted=min(1.0,max($previous,($m-$rank)*$entry['p']));$previous=$adjusted;
        $pairs[$entry['index']]['holm_p']=$adjusted;$pairs[$entry['index']]['significant']=$adjusted<$alpha;}
    return $pairs;
}

$action = $_GET['action'] ?? '';
$input = body();

try {
    if ($action === 'status') {
        respond(['ok' => true, 'logged_in' => loggedIn(), 'app_name' => $config['app_name'], 'version' => $config['app_version']]);
    }
    if ($action === 'login') {
        $password = (string)($input['password'] ?? '');
        $valid = false;
        if (!empty($config['login_password_hash'])) {
            $valid = password_verify($password, $config['login_password_hash']);
        } else {
            $valid = hash_equals((string)$config['login_password_plain'], $password);
        }
        if (!$valid) respond(['ok' => false, 'error' => 'パスワードが違います。'], 403);
        session_regenerate_id(true);
        $_SESSION['bread_logged_in'] = true;
        respond(['ok' => true]);
    }
    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        respond(['ok' => true]);
    }

    requireLogin();
    $pdo = db($config);

    if ($action === 'experiments') {
        $sql = "SELECT e.*, COUNT(DISTINCT t.id) treatment_count, COUNT(DISTINCT s.id) sample_count
                FROM experiments e
                LEFT JOIN treatments t ON t.experiment_id=e.id
                LEFT JOIN samples s ON s.experiment_id=e.id
                GROUP BY e.id ORDER BY e.created_at DESC";
        respond(['ok' => true, 'items' => $pdo->query($sql)->fetchAll()]);
    }

    if ($action === 'create_experiment') {
        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') respond(['ok' => false, 'error' => '試験名は必須です。'], 422);
        $st = $pdo->prepare("INSERT INTO experiments(name,objective,researcher,institution,start_date,notes) VALUES(?,?,?,?,?,?)");
        $st->execute([$name, $input['objective'] ?? '', $input['researcher'] ?? '', $input['institution'] ?? '',
                      ($input['start_date'] ?? '') ?: null, $input['notes'] ?? '']);
        respond(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($action === 'treatments') {
        $eid = (int)($_GET['experiment_id'] ?? 0);
        $st = $pdo->prepare("SELECT * FROM treatments WHERE experiment_id=? ORDER BY display_order,name");
        $st->execute([$eid]);
        respond(['ok' => true, 'items' => $st->fetchAll()]);
    }

    if ($action === 'create_treatment') {
        $eid = (int)($input['experiment_id'] ?? 0);
        $name = trim((string)($input['name'] ?? ''));
        if (!$eid || $name === '') respond(['ok' => false, 'error' => '試験と試験区名は必須です。'], 422);
        $st = $pdo->prepare("INSERT INTO treatments(experiment_id,name,display_order,description) VALUES(?,?,?,?)");
        $st->execute([$eid, $name, (int)($input['display_order'] ?? 1), $input['description'] ?? '']);
        respond(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($action === 'update_samples') {
        $items = $input['items'] ?? null;
        if (!is_array($items) || !$items) respond(['ok'=>false,'error'=>'更新するデータがありません。'],422);
        if (count($items) > 500) respond(['ok'=>false,'error'=>'一度に更新できるデータは500件までです。'],422);
        $normalized = [];
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $sampleId = (int)($item['sample_id'] ?? 0);
            $treatmentId = (int)($item['treatment_id'] ?? 0);
            $sampleCode = trim((string)($item['sample_code'] ?? ''));
            $nameLength = function_exists('mb_strlen') ? mb_strlen($sampleCode, 'UTF-8') : strlen($sampleCode);
            if (!$sampleId || !$treatmentId || $sampleCode === '') {
                respond(['ok'=>false,'error'=>'試験区とサンプル名は必須です。'],422);
            }
            if ($nameLength > 200) respond(['ok'=>false,'error'=>'サンプル名は200文字以内にしてください。'],422);
            $normalized[$sampleId] = ['sample_id'=>$sampleId,'treatment_id'=>$treatmentId,'sample_code'=>$sampleCode];
        }
        if (!$normalized) respond(['ok'=>false,'error'=>'更新できるデータがありません。'],422);
        $sampleSt = $pdo->prepare('SELECT experiment_id FROM samples WHERE id=?');
        $treatmentSt = $pdo->prepare('SELECT id FROM treatments WHERE id=? AND experiment_id=?');
        $updateSt = $pdo->prepare('UPDATE samples SET treatment_id=?,sample_code=? WHERE id=?');
        $treatmentCache = [];
        $pdo->beginTransaction();
        foreach ($normalized as $item) {
            $sampleSt->execute([$item['sample_id']]);
            $sample = $sampleSt->fetch();
            if (!$sample) throw new RuntimeException('更新対象のデータが見つかりません: ID ' . $item['sample_id']);
            $cacheKey = $sample['experiment_id'] . ':' . $item['treatment_id'];
            if (!array_key_exists($cacheKey, $treatmentCache)) {
                $treatmentSt->execute([$item['treatment_id'],(int)$sample['experiment_id']]);
                $treatmentCache[$cacheKey] = (bool)$treatmentSt->fetch();
            }
            if (!$treatmentCache[$cacheKey]) throw new RuntimeException('選択した試験区は対象データと同じ試験に属していません。');
            $updateSt->execute([$item['treatment_id'],$item['sample_code'],$item['sample_id']]);
        }
        $pdo->commit();
        respond(['ok'=>true,'updated_count'=>count($normalized)]);
    }


    if ($action === 'dashboard') {
        $sql = "SELECT
            (SELECT COUNT(*) FROM experiments) experiment_count,
            (SELECT COUNT(*) FROM treatments) treatment_count,
            (SELECT COUNT(*) FROM samples) sample_count,
            (SELECT COUNT(*) FROM holes) hole_count,
            (SELECT AVG(porosity_percent) FROM samples) mean_porosity,
            (SELECT MAX(processed_at) FROM samples) last_processed_at";
        $totals = $pdo->query($sql)->fetch();
        $recent = $pdo->query("SELECT e.name experiment_name,t.name treatment_name,s.sample_code,
            s.porosity_percent,s.hole_count,s.processed_at
            FROM samples s JOIN experiments e ON e.id=s.experiment_id
            JOIN treatments t ON t.id=s.treatment_id
            ORDER BY s.processed_at DESC LIMIT 10")->fetchAll();
        $byExperiment = $pdo->query("SELECT e.id,e.name,COUNT(s.id) sample_count,
            AVG(s.porosity_percent) mean_porosity,MAX(s.processed_at) last_processed_at
            FROM experiments e LEFT JOIN samples s ON s.experiment_id=e.id
            GROUP BY e.id ORDER BY e.created_at DESC")->fetchAll();
        respond(['ok'=>true,'totals'=>$totals,'recent'=>$recent,'experiments'=>$byExperiment]);
    }

    if ($action === 'statistics') {
        $metricLabels = [
            'bread_area_mm2'=>'パン断面積(mm²)','hole_count'=>'空洞数','hole_area_mm2'=>'空洞合計面積(mm²)',
            'porosity_percent'=>'空洞率(%)','mean_hole_area_mm2'=>'平均空洞面積(mm²)',
            'binary_white_area_mm2'=>'二値化白領域（空洞）面積(mm²)',
            'binary_black_area_mm2'=>'二値化黒領域（生地）面積(mm²)',
            'binary_white_percent'=>'二値化白領域率(%)','binary_black_percent'=>'二値化黒領域率(%)',
            'median_hole_area_mm2'=>'空洞面積中央値(mm²)','max_hole_area_mm2'=>'最大空洞面積(mm²)',
            'mean_eq_diameter_mm'=>'平均円相当直径(mm)','small_hole_count'=>'小空洞数',
            'medium_hole_count'=>'中空洞数','large_hole_count'=>'大空洞数'
        ];
        $experimentId = (int)($input['experiment_id'] ?? 0);
        $metric = (string)($input['metric'] ?? 'porosity_percent');
        $alpha = max(0.001, min(0.2, (float)($input['alpha'] ?? 0.05)));
        $source = (string)($input['source'] ?? 'latest');
        if (!$experimentId) respond(['ok'=>false,'error'=>'試験を選択してください。'],422);
        if (!isset($metricLabels[$metric])) respond(['ok'=>false,'error'=>'比較項目が不正です。'],422);
        $parameters = [$experimentId];
        $where = 's.experiment_id=?';
        $selectedIds = [];
        if ($source === 'selected') {
            foreach (($input['sample_ids'] ?? []) as $id) {
                $id = (int)$id;
                if ($id > 0) $selectedIds[$id] = $id;
            }
            $selectedIds = array_values($selectedIds);
            if (!$selectedIds) respond(['ok'=>false,'error'=>'データ一覧で統計対象を選択してください。'],422);
            if (count($selectedIds) > 5000) respond(['ok'=>false,'error'=>'一度に選択できるデータは5000件までです。'],422);
            $where .= ' AND s.id IN (' . implode(',', array_fill(0,count($selectedIds),'?')) . ')';
            foreach ($selectedIds as $id) $parameters[]=$id;
        } elseif ($source === 'all') {
            $source = 'all';
        } else {
            $source = 'latest';
            $where .= " AND NOT EXISTS (
                SELECT 1 FROM samples newer
                WHERE newer.experiment_id=s.experiment_id
                  AND COALESCE(newer.parent_sample_id,newer.id)=COALESCE(s.parent_sample_id,s.id)
                  AND (newer.revision_no>s.revision_no OR (newer.revision_no=s.revision_no AND newer.id>s.id))
            )";
        }
        $sql = "SELECT s.id,s.sample_code,s.replicate_no,s.revision_no,s.processed_at,
                s.treatment_id,t.name treatment_name,t.display_order,CAST(s.`{$metric}` AS DECIMAL(24,8)) metric_value
                FROM samples s JOIN treatments t ON t.id=s.treatment_id
                WHERE {$where} ORDER BY t.display_order,t.name,s.sample_code,s.id";
        $statement = $pdo->prepare($sql);
        $statement->execute($parameters);
        $rows = $statement->fetchAll();
        // Metrics added in newer versions remain NULL for historical analyses.
        // Exclude those rows instead of silently treating NULL as zero.
        $rows = array_values(array_filter($rows, fn($row) => $row['metric_value'] !== null));
        if (!$rows) respond(['ok'=>false,'error'=>'統計処理できるデータがありません。'],422);
        $groupMap=[];
        foreach($rows as $row){
            $id=(int)$row['treatment_id'];
            if(!isset($groupMap[$id]))$groupMap[$id]=['treatment_id'=>$id,'name'=>$row['treatment_name'],
                'display_order'=>(int)$row['display_order'],'values'=>[],'samples'=>[]];
            $value=(float)$row['metric_value'];
            $groupMap[$id]['values'][]=$value;
            $groupMap[$id]['samples'][]=['id'=>(int)$row['id'],'sample_code'=>$row['sample_code'],
                'replicate_no'=>$row['replicate_no'],'revision_no'=>(int)$row['revision_no'],
                'processed_at'=>$row['processed_at'],'value'=>$value];
        }
        $groupRows=array_values($groupMap);
        usort($groupRows,fn($a,$b)=>($a['display_order']<=>$b['display_order'])?:strcmp($a['name'],$b['name']));
        foreach($groupRows as &$group)$group['summary']=statsDescribe($group['values'],$alpha);
        unset($group);
        $numericGroups=array_map(fn($group)=>$group['values'],$groupRows);
        $tests=[];
        if(count($groupRows)===2){$welch=statsWelch($groupRows[0]['values'],$groupRows[1]['values']);
            $tests[]=['name'=>'Welchのt検定','statistic_label'=>'t','statistic'=>$welch['t'],
                'df1'=>$welch['df'],'df2'=>null,'p'=>$welch['p']];}
        if(count($groupRows)>=2){$anova=statsAnova($numericGroups);$tests[]=['name'=>'一元配置分散分析','statistic_label'=>'F',
            'statistic'=>$anova['f'],'df1'=>$anova['df1'],'df2'=>$anova['df2'],'p'=>$anova['p']];
            $kruskal=statsKruskalWallis($numericGroups);$tests[]=['name'=>'Kruskal–Wallis検定','statistic_label'=>'H',
                'statistic'=>$kruskal['h'],'df1'=>$kruskal['df'],'df2'=>null,'p'=>$kruskal['p']];}
        $pairs=statsHolmPairs($groupRows,$alpha);
        respond(['ok'=>true,'experiment_id'=>$experimentId,'metric'=>$metric,'metric_label'=>$metricLabels[$metric],
            'alpha'=>$alpha,'source'=>$source,'sample_count'=>count($rows),'group_count'=>count($groupRows),
            'groups'=>$groupRows,'tests'=>$tests,'pairs'=>$pairs]);
    }

    if ($action === 'presets') {
        $items = $pdo->query("SELECT * FROM analysis_presets ORDER BY name")->fetchAll();
        respond(['ok'=>true,'items'=>$items]);
    }

    if ($action === 'save_preset') {
        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') respond(['ok'=>false,'error'=>'プリセット名は必須です。'],422);
        $json = json_encode($input['parameters'] ?? [], JSON_UNESCAPED_UNICODE);
        $st = $pdo->prepare("INSERT INTO analysis_presets(name,description,parameter_json)
            VALUES(?,?,?) ON DUPLICATE KEY UPDATE description=VALUES(description),parameter_json=VALUES(parameter_json)");
        $st->execute([$name,$input['description'] ?? '',$json]);
        respond(['ok'=>true]);
    }

    if ($action === 'sample') {
        $sid = (int)($_GET['sample_id'] ?? 0);
        $st = $pdo->prepare("SELECT s.*,t.name treatment_name,e.name experiment_name,
            (SELECT mc.corrected_result_path FROM manual_corrections mc
             WHERE mc.sample_id=s.id ORDER BY mc.created_at DESC,mc.id DESC LIMIT 1) latest_corrected_result_path,
            (SELECT mc.created_at FROM manual_corrections mc
             WHERE mc.sample_id=s.id ORDER BY mc.created_at DESC,mc.id DESC LIMIT 1) latest_correction_at
            FROM samples s JOIN treatments t ON t.id=s.treatment_id
            JOIN experiments e ON e.id=s.experiment_id WHERE s.id=?");
        $st->execute([$sid]);
        $item=$st->fetch();
        if(!$item) respond(['ok'=>false,'error'=>'サンプルがありません。'],404);
        respond(['ok'=>true,'item'=>$item]);
    }

    if ($action === 'python_status') {
        $diagnostic = runPython($config, ['--diagnose']);
        respond(['ok' => true, 'engine' => $diagnostic]);
    }

    if ($action === 'detect_bread') {
        if (empty($input['analysis_image'])) respond(['ok'=>false,'error'=>'輪郭検出用画像がありません。'],422);
        $parameters = is_array($input['parameters'] ?? null) ? $input['parameters'] : [];
        $tmpDir = __DIR__ . '/uploads/tmp';
        if (!is_dir($tmpDir) && !mkdir($tmpDir, 0755, true) && !is_dir($tmpDir)) throw new RuntimeException('一時保存ディレクトリを作成できません。');
        $inputPath = saveDataUrlAbsolute((string)$input['analysis_image'], $tmpDir, 'bread_source');
        $maskPath = $tmpDir . '/bread_preview_' . bin2hex(random_bytes(6)) . '.png';
        $response = null;
        try {
            $diagnostic = runPython($config, [
                '--detect-bread', '--input', $inputPath, '--mask-output', $maskPath,
                '--parameters-json', json_encode($parameters, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            if (!is_file($maskPath)) throw new RuntimeException('パン輪郭マスクが生成されませんでした。');
            $maskData = file_get_contents($maskPath);
            if ($maskData === false) throw new RuntimeException('パン輪郭マスクを読み込めません。');
            $response = ['ok'=>true,'mask'=>'data:image/png;base64,' . base64_encode($maskData),
                'width'=>$diagnostic['width'] ?? null,'height'=>$diagnostic['height'] ?? null,
                'area_pixels'=>$diagnostic['area_pixels'] ?? null];
        } finally {
            if (is_file($inputPath)) @unlink($inputPath);
            if (is_file($maskPath)) @unlink($maskPath);
        }
        respond($response ?? ['ok'=>false,'error'=>'パン輪郭を検出できませんでした。'], $response ? 200 : 500);
    }

    if ($action === 'analyze_python') {
        foreach (['experiment_id','treatment_id','sample_code','dpi','parameters','analysis_image','original_image'] as $key) {
            if (!array_key_exists($key, $input)) respond(['ok'=>false,'error'=>"不足項目: {$key}"],422);
        }
        if (!is_array($input['parameters'])) respond(['ok'=>false,'error'=>'解析パラメータが不正です。'],422);
        $tmpDir = __DIR__ . '/uploads/tmp';
        $resultDir = __DIR__ . '/uploads/result';
        $intermediateDir = __DIR__ . '/uploads/intermediate';
        foreach ([$tmpDir, $resultDir, $intermediateDir] as $dir) {
            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('画像保存ディレクトリを作成できません。');
        }
        $inputPath = saveDataUrlAbsolute((string)$input['analysis_image'], $tmpDir, 'roi');
        $analysisScope = (string)($input['parameters']['analysis_scope'] ?? 'rectangle');
        $breadMaskPath = null;
        $breadMaskAbsolute = null;
        if ($analysisScope === 'bread') {
            $breadMaskPath = saveDataUrl((string)($input['bread_mask'] ?? ''), $intermediateDir, 'bread_mask');
            if ($breadMaskPath === null) {
                if (is_file($inputPath)) @unlink($inputPath);
                respond(['ok'=>false,'error'=>'パン輪郭を自動検出し、必要に応じて修正してから解析してください。'],422);
            }
            $breadMaskAbsolute = __DIR__ . '/' . $breadMaskPath;
        }
        $prefix = 'analysis_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4));
        try {
            $pythonArguments = [
                '--input', $inputPath,
                '--output-dir', $resultDir,
                '--intermediate-dir', $intermediateDir,
                '--parameters-json', json_encode($input['parameters'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                '--prefix', $prefix,
            ];
            if ($breadMaskAbsolute !== null) { $pythonArguments[]='--measurement-mask'; $pythonArguments[]=$breadMaskAbsolute; }
            $analysis = runPython($config, $pythonArguments);
        } finally {
            if (is_file($inputPath)) @unlink($inputPath);
        }
        validateAnalysisResult($analysis);
        $resultPath = resultPublicPath($resultDir, $analysis['result_image'] ?? '');
        $originalPath = saveDataUrl((string)$input['original_image'], __DIR__.'/uploads/original', 'original');
        if ($originalPath === null) throw new RuntimeException('元画像を保存できません。');
        $input['summary'] = $analysis['summary'] ?? [];
        $input['holes'] = $analysis['holes'] ?? [];
        $input['parameters']['engine'] = 'Python OpenCV 4.5.5';
        $input['parameters']['algorithm_version'] = $analysis['engine']['algorithm_version'] ?? '10.6.0-python';
        $saved = insertAnalysis($pdo, $config, $input, $originalPath, $resultPath, $breadMaskPath);
        $intermediates = [];
        foreach (($analysis['intermediates'] ?? []) as $name => $fileName) {
            $intermediates[$name] = resultPublicPath($intermediateDir, $fileName);
        }
        respond([
            'ok' => true,
            'sample_id' => $saved['sample_id'],
            'processed_at' => $saved['processed_at'],
            'summary' => $input['summary'],
            'holes' => $input['holes'],
            'result_image_path' => $resultPath,
            'bread_mask_path' => $breadMaskPath,
            'intermediates' => $intermediates,
            'engine' => $analysis['engine'] ?? null,
        ]);
    }

    if ($action === 'save_analysis') {
        $originalPath = saveDataUrl((string)($input['original_image'] ?? ''), __DIR__.'/uploads/original', 'original');
        $resultPath = saveDataUrl((string)($input['result_image'] ?? ''), __DIR__.'/uploads/result', 'result');
        $saved = insertAnalysis($pdo, $config, $input, $originalPath, $resultPath, null);
        respond(['ok' => true, 'sample_id' => $saved['sample_id'], 'processed_at' => $saved['processed_at']]);
    }

    if ($action === 'samples') {
        $eid = (int)($_GET['experiment_id'] ?? 0);
        $st = $pdo->prepare("SELECT s.*, t.name treatment_name
            FROM samples s JOIN treatments t ON t.id=s.treatment_id
            WHERE s.experiment_id=? ORDER BY t.display_order,s.sample_code,s.id");
        $st->execute([$eid]);
        respond(['ok' => true, 'items' => $st->fetchAll()]);
    }

    if ($action === 'holes') {
        $sid = (int)($_GET['sample_id'] ?? 0);
        $st = $pdo->prepare("SELECT * FROM holes WHERE sample_id=? ORDER BY hole_number");
        $st->execute([$sid]);
        respond(['ok' => true, 'items' => $st->fetchAll()]);
    }

    if ($action === 'delete_sample') {
        $sid = (int)($input['sample_id'] ?? 0);
        $st = $pdo->prepare("SELECT original_image_path,result_image_path,bread_mask_path FROM samples WHERE id=?");
        $st->execute([$sid]);
        $row = $st->fetch();
        if ($row) {
            foreach (['original_image_path','result_image_path','bread_mask_path'] as $k) {
                if (!empty($row[$k])) {
                    $path = __DIR__ . '/' . $row[$k];
                    if (is_file($path)) @unlink($path);
                }
            }
            $del = $pdo->prepare("DELETE FROM samples WHERE id=?");
            $del->execute([$sid]);
        }
        respond(['ok' => true]);
    }

    respond(['ok' => false, 'error' => '不明な操作です。'], 404);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
