<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
$config=require __DIR__.'/config.php';
if(empty($_SESSION['bread_logged_in'])){http_response_code(401);echo json_encode(['ok'=>false,'error'=>'ログインが必要です。']);exit;}
$raw=file_get_contents('php://input');$in=json_decode($raw,true);
if(!is_array($in)){http_response_code(422);echo json_encode(['ok'=>false,'error'=>'データ形式が不正です。']);exit;}
function db(array $c):PDO{$d=$c['db'];return new PDO("mysql:host={$d['host']};dbname={$d['name']};charset={$d['charset']}",$d['user'],$d['pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}
try{
 $pdo=db($config);$sid=(int)($in['sample_id']??0);$dataUrl=(string)($in['image']??'');
 if(!$sid||!preg_match('#^data:image/png;base64,#',$dataUrl))throw new RuntimeException('補正画像がありません。');
 $bin=base64_decode(substr($dataUrl,strpos($dataUrl,',')+1),true);
 if($bin===false)throw new RuntimeException('画像を保存できません。');
 $dir=__DIR__.'/uploads/corrected';if(!is_dir($dir))mkdir($dir,0755,true);
 $path=$dir.'/corrected_'.$sid.'_'.date('Ymd_His').'.png';file_put_contents($path,$bin);
 $st=$pdo->prepare("INSERT INTO manual_corrections(sample_id,correction_json,corrected_result_path) VALUES(?,?,?)");
 $st->execute([$sid,json_encode($in['actions']??[],JSON_UNESCAPED_UNICODE),str_replace(__DIR__.'/','',$path)]);
 echo json_encode(['ok'=>true,'path'=>str_replace(__DIR__.'/','',$path)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}catch(Throwable $e){http_response_code(500);echo json_encode(['ok'=>false,'error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
