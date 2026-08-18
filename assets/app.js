const $=id=>document.getElementById(id);
let experiments=[],currentSamples=[],roi=null,roiImage=null,serverPresets={},rerunMeta=null;
let manualEdit={sampleId:null,baseImage:null,actions:[]};
let savedAnalysis=null;
let rerunFile=null;
let dataTableState={
  search:'',
  page:1,
  pageSize:50,
  sortKey:'processed_at',
  sortDir:'desc',
  visibleColumns:{}
};
let filteredSamples=[];
let selectedSampleIds=new Set();
let selectedExperimentId=null;
let currentStats=null;
let breadMaskStateCanvas=null,breadMaskOriginalDataUrl=null,breadMaskPrepared=null,breadMaskEditMode='add';
let engineReady=false;
let activeAnalysisController=null;
let engineDiagnostic=null;
const builtinPresets={'食パン（研究標準）':{dpi:300,max_dimension:1400,use_clahe:true,clahe_clip:2,clahe_tiles:8,blur_size:5,threshold_mode:'adaptive',hole_threshold:145,adaptive_block:41,adaptive_c:5,open_size:1,close_size:3,use_distance:true,distance_ratio:.35,use_watershed:true,background_dilate:3,use_large_hole_rescue:true,large_hole_window:61,large_hole_contrast:12,large_hole_min_area_mm2:2,large_hole_max_fraction:.05,border_margin:3,min_area_mm2:.15,max_area_mm2:0,min_circularity:0,max_aspect_ratio:20,small_limit_mm:2,medium_limit_mm:4,fill_contours:true,show_numbers:true,save_intermediates:true}};
async function api(action,opt={}){
 const r=await fetch(`api.php?action=${action}${opt.query||''}`,{method:opt.method||'GET',headers:{'Content-Type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined});
 const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'通信エラー');return d;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=id=>Number($(id).value);
function parameters(){return{analysis_scope:$('analysisScope').value,dpi:num('dpi'),max_dimension:num('maxDimension'),use_clahe:$('useClahe').value==='1',clahe_clip:num('claheClip'),clahe_tiles:num('claheTiles'),blur_size:num('blurSize'),threshold_mode:$('thresholdMode').value,hole_threshold:num('holeThreshold'),adaptive_block:num('adaptiveBlock'),adaptive_c:num('adaptiveC'),open_size:num('openSize'),close_size:num('closeSize'),use_distance:$('useDistance').value==='1',distance_ratio:num('distanceRatio'),use_watershed:$('useWatershed').value==='1',background_dilate:num('backgroundDilate'),use_large_hole_rescue:$('useLargeHoleRescue').value==='1',large_hole_window:num('largeHoleWindow'),large_hole_contrast:num('largeHoleContrast'),large_hole_min_area_mm2:num('largeHoleMinArea'),large_hole_max_fraction:num('largeHoleMaxFraction')/100,border_margin:num('borderMargin'),min_area_mm2:num('minArea'),max_area_mm2:num('maxArea'),min_circularity:num('minCircularity'),max_aspect_ratio:num('maxAspect'),small_limit_mm:num('smallLimit'),medium_limit_mm:num('mediumLimit'),fill_contours:$('fillContours').value==='1',show_numbers:$('showNumbers').value==='1',save_intermediates:$('saveIntermediates').value==='1'};}
function setParameters(p){const m={analysis_scope:'analysisScope',dpi:'dpi',max_dimension:'maxDimension',use_clahe:'useClahe',clahe_clip:'claheClip',clahe_tiles:'claheTiles',blur_size:'blurSize',threshold_mode:'thresholdMode',hole_threshold:'holeThreshold',adaptive_block:'adaptiveBlock',adaptive_c:'adaptiveC',open_size:'openSize',close_size:'closeSize',use_distance:'useDistance',distance_ratio:'distanceRatio',use_watershed:'useWatershed',background_dilate:'backgroundDilate',use_large_hole_rescue:'useLargeHoleRescue',large_hole_window:'largeHoleWindow',large_hole_contrast:'largeHoleContrast',large_hole_min_area_mm2:'largeHoleMinArea',border_margin:'borderMargin',min_area_mm2:'minArea',max_area_mm2:'maxArea',min_circularity:'minCircularity',max_aspect_ratio:'maxAspect',small_limit_mm:'smallLimit',medium_limit_mm:'mediumLimit',fill_contours:'fillContours',show_numbers:'showNumbers',save_intermediates:'saveIntermediates'};Object.entries(m).forEach(([k,id])=>{if(p[k]!=null)$(id).value=typeof p[k]==='boolean'?(p[k]?'1':'0'):p[k]});if(p.large_hole_max_fraction!=null)$('largeHoleMaxFraction').value=Number(p.large_hole_max_fraction)*100;updateAnalysisScopeUi();}

function setProgressIndeterminate(on){
 const shell=$('progressShell');
 if(!shell)return;
 shell.classList.toggle('indeterminate',on);
 if(on)$('analysisProgressBar').style.width='35%';
}
function setWorkerState(text,kind='idle'){
 const el=$('workerState');
 if(!el)return;
 el.textContent=text;
 el.className=`worker-state ${kind}`;
 $('analysisStatus').classList.toggle('error-state',kind==='error');
}
function showWorkerPreparing(show,text='Python OpenCVの動作を確認しています。'){
 $('workerPreparing').classList.toggle('hidden',!show);
 $('workerPreparingText').textContent=text;
}
async function diagnosePython(force=false){
 if(engineReady&&!force)return engineDiagnostic;
 setWorkerState('診断中','preparing');
 setProgressIndeterminate(true);
 showWorkerPreparing(true,'Xserver上のPython・OpenCV・NumPyを確認しています…');
 try{
   const response=await api('python_status');
   engineDiagnostic=response.engine;
   engineReady=true;
   setWorkerState('利用可能','ready');
   const text=`Python ${engineDiagnostic.python_version} / OpenCV ${engineDiagnostic.opencv_version} / NumPy ${engineDiagnostic.numpy_version}`;
   $('analysisProgress').textContent=`解析エンジン確認完了：${text}`;
   return engineDiagnostic;
 }catch(error){
   engineReady=false;
   setWorkerState('診断エラー','error');
   throw error;
 }finally{
   setProgressIndeterminate(false);
   showWorkerPreparing(false);
 }
}
async function runPythonAnalysis(payload){
 if(activeAnalysisController)throw new Error('別の画像を解析中です。');
 activeAnalysisController=new AbortController();
 $('cancelAnalysis').disabled=false;
 setProgressIndeterminate(true);
 try{
   const requestBody=JSON.stringify(payload);
   const requestMb=new Blob([requestBody]).size/1024/1024;
   $('analysisProgress').textContent=`Python OpenCVで解析中（送信 ${requestMb.toFixed(1)} MB）`;
   const response=await fetch('api.php?action=analyze_python',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:requestBody,
     signal:activeAnalysisController.signal
   });
   const responseText=await response.text();
   if(!responseText.trim()){
     if(response.status===413)throw new Error('画像データがサーバーの送信上限を超えました（HTTP 413）。Xserverのpost_max_sizeを確認してください。');
     throw new Error(`サーバーから解析結果が返りませんでした（HTTP ${response.status}、送信 ${requestMb.toFixed(1)} MB）。PHPのmemory_limit、post_max_size、エラーログを確認してください。`);
   }
   let result;
   try{result=JSON.parse(responseText);}catch(_){
     const detail=responseText.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
     throw new Error(`サーバー応答がJSONではありません（HTTP ${response.status}）。${detail||'PHPエラーログを確認してください。'}`);
   }
   if(!response.ok||!result.ok)throw new Error(result.error||'Python解析に失敗しました。');
   return result;
 }finally{
   activeAnalysisController=null;
   $('cancelAnalysis').disabled=true;
   setProgressIndeterminate(false);
 }
}
function prepareRoiImage(img,p){
 const r=roi||{x:0,y:0,w:img.naturalWidth,h:img.naturalHeight};
 const sx=Math.max(0,Math.round(r.x));
 const sy=Math.max(0,Math.round(r.y));
 const sw=Math.max(1,Math.min(img.naturalWidth-sx,Math.round(r.w)));
 const sh=Math.max(1,Math.min(img.naturalHeight-sy,Math.round(r.h)));
 const scale=Math.min(1,Number(p.max_dimension||1400)/Math.max(sw,sh));
 const w=Math.max(1,Math.round(sw*scale));
 const h=Math.max(1,Math.round(sh*scale));
 const c=document.createElement('canvas');
 c.width=w;c.height=h;
 c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,w,h);
 return {
   // 写真をPNG化すると数十MBになるため、高品質JPEGで解析用ROIを送る。
   analysisDataUrl:c.toDataURL('image/jpeg',0.94),
   width:w,height:h,
   scale,
   roi:{x:sx,y:sy,w:sw,h:sh}
 };
}
function prepareBreadImage(img,p){
 const scale=Math.min(1,Number(p.max_dimension||1400)/Math.max(img.naturalWidth,img.naturalHeight));
 const width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 canvas.getContext('2d').drawImage(img,0,0,width,height);
 return {analysisDataUrl:canvas.toDataURL('image/jpeg',0.94),width,height,scale,canvas,
   roi:{mode:'bread',x:0,y:0,w:img.naturalWidth,h:img.naturalHeight}};
}
function updateAnalysisScopeUi(){
 const bread=$('analysisScope').value==='bread';
 $('breadMaskControls').classList.toggle('hidden',!bread);
 document.querySelectorAll('.roi-controls,.roi-wrap').forEach(element=>element.style.display=bread?'none':'');
}
function renderBreadMaskOverlay(){
 if(!breadMaskStateCanvas)return;
 const overlay=$('breadMaskOverlayCanvas');overlay.width=breadMaskStateCanvas.width;overlay.height=breadMaskStateCanvas.height;
 const context=overlay.getContext('2d');context.clearRect(0,0,overlay.width,overlay.height);
 context.fillStyle='#00d15b';context.fillRect(0,0,overlay.width,overlay.height);
 context.globalCompositeOperation='destination-in';context.drawImage(breadMaskStateCanvas,0,0);context.globalCompositeOperation='source-over';
}
function normalizeBreadMaskTransparency(canvas){
 const context=canvas.getContext('2d'),image=context.getImageData(0,0,canvas.width,canvas.height),data=image.data;
 for(let index=0;index<data.length;index+=4){
  const selected=data[index]>127;data[index]=selected?255:0;data[index+1]=selected?255:0;data[index+2]=selected?255:0;data[index+3]=selected?255:0;
 }
 context.putImageData(image,0,0);
}
function breadMaskBrushRadius(){
 const input=$('breadMaskBrush'),raw=Number(input.value),value=Math.min(200,Math.max(2,Number.isFinite(raw)?raw:25));
 input.value=String(value);return value;
}
function updateBreadMaskArea(){
 if(!breadMaskStateCanvas||!breadMaskPrepared)return;
 const data=breadMaskStateCanvas.getContext('2d').getImageData(0,0,breadMaskStateCanvas.width,breadMaskStateCanvas.height).data;
 let pixels=0;for(let index=0;index<data.length;index+=4)if(data[index]>127)pixels++;
 const mmPerPixel=(25.4/Math.max(1,num('dpi')))/breadMaskPrepared.scale;
 $('breadMaskStatus').textContent=`パン領域：${pixels.toLocaleString('ja-JP')} px（約 ${(pixels*mmPerPixel*mmPerPixel).toFixed(1)} mm²）`;
}
function setBreadMaskMode(mode){
 breadMaskEditMode=mode;$('breadMaskAdd').classList.toggle('active',mode==='add');$('breadMaskRemove').classList.toggle('active',mode==='remove');
}
async function setupBreadMaskEditor(prepared,maskDataUrl){
 const source=$('breadSourceCanvas');source.width=prepared.canvas.width;source.height=prepared.canvas.height;source.getContext('2d').drawImage(prepared.canvas,0,0);
 const maskImage=new Image();await new Promise((resolve,reject)=>{maskImage.onload=resolve;maskImage.onerror=reject;maskImage.src=maskDataUrl;});
 breadMaskStateCanvas=document.createElement('canvas');breadMaskStateCanvas.width=prepared.canvas.width;breadMaskStateCanvas.height=prepared.canvas.height;
 const maskContext=breadMaskStateCanvas.getContext('2d');maskContext.drawImage(maskImage,0,0,prepared.canvas.width,prepared.canvas.height);
 normalizeBreadMaskTransparency(breadMaskStateCanvas);
 breadMaskOriginalDataUrl=breadMaskStateCanvas.toDataURL('image/png');breadMaskPrepared={width:prepared.canvas.width,height:prepared.canvas.height,scale:prepared.scale};
 renderBreadMaskOverlay();updateBreadMaskArea();$('breadMaskEditor').classList.remove('hidden');
}
async function detectBreadBoundary(){
 const file=$('imageFiles').files[0]||rerunFile;if(!file)return alert('先に画像を選択してください。');
 $('breadMaskStatus').textContent='Python OpenCVでパン輪郭を検出しています…';
 try{
   const image=await loadImage(file),prepared=prepareBreadImage(image,parameters());
   const result=await api('detect_bread',{method:'POST',body:{analysis_image:prepared.analysisDataUrl,parameters:parameters()}});
   await setupBreadMaskEditor(prepared,result.mask);
 }catch(error){$('breadMaskStatus').textContent='輪郭検出に失敗しました：'+error.message;alert(error.message);}
}
$('analysisScope').onchange=updateAnalysisScopeUi;
$('dpi').addEventListener('input',updateBreadMaskArea);
$('detectBreadMask').onclick=detectBreadBoundary;
$('breadMaskAdd').onclick=()=>setBreadMaskMode('add');
$('breadMaskRemove').onclick=()=>setBreadMaskMode('remove');
$('breadMaskBrush').addEventListener('change',breadMaskBrushRadius);
$('resetBreadMask').onclick=async()=>{if(breadMaskOriginalDataUrl&&breadMaskPrepared){const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=breadMaskOriginalDataUrl;});const context=breadMaskStateCanvas.getContext('2d');context.clearRect(0,0,breadMaskStateCanvas.width,breadMaskStateCanvas.height);context.drawImage(image,0,0);renderBreadMaskOverlay();updateBreadMaskArea();}};
{
 const overlay=$('breadMaskOverlayCanvas');let drawing=false;
 const paint=event=>{if(!drawing||!breadMaskStateCanvas)return;event.preventDefault();const rect=overlay.getBoundingClientRect(),x=(event.clientX-rect.left)*overlay.width/rect.width,y=(event.clientY-rect.top)*overlay.height/rect.height,radius=breadMaskBrushRadius()*overlay.width/rect.width;const context=breadMaskStateCanvas.getContext('2d');context.save();context.globalCompositeOperation=breadMaskEditMode==='add'?'source-over':'destination-out';context.fillStyle='#fff';context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();context.restore();renderBreadMaskOverlay();};
 overlay.onpointerdown=event=>{event.preventDefault();drawing=true;overlay.setPointerCapture(event.pointerId);paint(event);};overlay.onpointermove=paint;overlay.onpointerup=overlay.onpointercancel=()=>{drawing=false;updateBreadMaskArea();};
}
$('imageFiles').addEventListener('change',()=>{breadMaskStateCanvas=null;breadMaskOriginalDataUrl=null;breadMaskPrepared=null;$('breadMaskEditor').classList.add('hidden');if($('analysisScope').value==='bread')$('breadMaskStatus').textContent='画像が変わりました。パン輪郭を自動検出してください。';});
function fileToDataUrl(file){
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('元画像を読み込めません。'));reader.readAsDataURL(file);});
}
async function prepareOriginalImageData(img,file){
 const supported=/^image\/(jpeg|png)$/i.test(file.type||'');
 // 通常のJPEG/PNGは元ファイルをそのまま送る。従来のcanvas PNG変換による巨大化を防ぐ。
 if(supported&&file.size<=10*1024*1024)return fileToDataUrl(file);
 // 10MB超または別形式は、縦横サイズを維持したJPEGに圧縮して保存する。
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
 canvas.getContext('2d').drawImage(img,0,0);
 return canvas.toDataURL('image/jpeg',0.82);
}

async function boot(){
 initDataTableState();
 const st=await api('status');
 if(st.logged_in){$('appView').classList.remove('hidden');await refreshExperiments();await loadDashboard();await loadPresets();}
 else $('loginView').classList.remove('hidden');
 $('measurementDate').value=new Date().toISOString().slice(0,10);
 updateAnalysisScopeUi();
}
$('loginButton').onclick=async()=>{try{await api('login',{method:'POST',body:{password:$('loginPassword').value}});location.reload()}catch(e){$('loginError').textContent=e.message}};
$('logoutButton').onclick=async()=>{await api('logout',{method:'POST'});location.reload()};
document.addEventListener('bread:tabchange',e=>{if(e.detail.tab==='dashboard')loadDashboard();if(e.detail.tab==='data')loadSamples();});
async function loadDashboard(){try{const d=await api('dashboard'),t=d.totals;
 $('dashboardMetrics').innerHTML=[['試験数',t.experiment_count],['試験区数',t.treatment_count],['サンプル数',t.sample_count],['検出空洞数',t.hole_count],['平均空洞率',Number(t.mean_porosity||0).toFixed(2)+'%'],['最終処理',t.last_processed_at||'—']].map(x=>`<div class="metric"><b>${x[0]}</b><br>${esc(x[1])}</div>`).join('');
 $('dashboardExperiments').innerHTML='<tr><th>研究テーマ</th><th>サンプル数</th><th>平均空洞率</th><th>最終処理</th></tr>'+d.experiments.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.sample_count}</td><td>${Number(x.mean_porosity||0).toFixed(2)}</td><td>${esc(x.last_processed_at||'')}</td></tr>`).join('');
 $('dashboardRecent').innerHTML='<tr><th>試験</th><th>試験区</th><th>サンプル</th><th>空洞率</th><th>日時</th></tr>'+d.recent.map(x=>`<tr><td>${esc(x.experiment_name)}</td><td>${esc(x.treatment_name)}</td><td>${esc(x.sample_code)}</td><td>${Number(x.porosity_percent).toFixed(2)}</td><td>${esc(x.processed_at)}</td></tr>`).join('');
}catch(e){console.error(e)}}
async function refreshExperiments(){experiments=(await api('experiments')).items;const o=experiments.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
 ['treatExperiment','analysisExperiment','dataExperiment','statsExperiment'].forEach(id=>$(id).innerHTML=o);
 $('experimentTable').innerHTML='<tr><th>試験名</th><th>研究者</th><th>開始日</th><th>試験区数</th><th>サンプル数</th></tr>'+experiments.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.researcher)}</td><td>${esc(e.start_date)}</td><td>${e.treatment_count}</td><td>${e.sample_count}</td></tr>`).join('');
 await refreshTreatments();}
async function refreshTreatments(){if(!$('analysisExperiment').value)return;const a=(await api('treatments',{query:`&experiment_id=${$('analysisExperiment').value}`})).items;
 $('analysisTreatment').innerHTML=a.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');}
$('analysisExperiment').onchange=refreshTreatments;
$('createExperiment').onclick=async()=>{try{await api('create_experiment',{method:'POST',body:{name:$('expName').value,objective:$('expObjective').value,researcher:$('expResearcher').value,institution:$('expInstitution').value,start_date:$('expStartDate').value,notes:$('expNotes').value}});await refreshExperiments();alert('登録しました')}catch(e){alert(e.message)}};
$('createTreatment').onclick=async()=>{try{await api('create_treatment',{method:'POST',body:{experiment_id:$('treatExperiment').value,name:$('treatName').value,display_order:num('treatOrder'),description:$('treatDescription').value}});await refreshTreatments();alert('登録しました')}catch(e){alert(e.message)}};
async function loadPresets(){const a=(await api('presets')).items;a.forEach(x=>serverPresets[x.name]=JSON.parse(x.parameter_json));const names=[...Object.keys(builtinPresets),...Object.keys(serverPresets)];$('presetSelect').innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');}
$('applyPreset').onclick=()=>{const n=$('presetSelect').value;setParameters(serverPresets[n]||builtinPresets[n])};
$('savePreset').onclick=async()=>{const name=$('presetName').value.trim();if(!name)return alert('名前を入力してください');await api('save_preset',{method:'POST',body:{name,parameters:parameters()}});await loadPresets();alert('保存しました')};
function loadImage(file){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=URL.createObjectURL(file)})}

function clampRoi() {
  if (!roiImage) return;
  const w = Math.max(20, Math.min(roiImage.naturalWidth, Number($('roiWidth').value) || 600));
  const h = Math.max(20, Math.min(roiImage.naturalHeight, Number($('roiHeight').value) || 400));
  let x = Math.max(0, Number($('roiX').value) || 0);
  let y = Math.max(0, Number($('roiY').value) || 0);
  x = Math.min(x, roiImage.naturalWidth - w);
  y = Math.min(y, roiImage.naturalHeight - h);
  roi = {x, y, w, h};
  $('roiWidth').value = Math.round(w);
  $('roiHeight').value = Math.round(h);
  $('roiX').value = Math.round(x);
  $('roiY').value = Math.round(y);
}
function drawFixedRoi() {
  if (!roiImage) return;
  clampRoi();
  const c = $('roiCanvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(roiImage, 0, 0);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.clearRect(roi.x, roi.y, roi.w, roi.h);
  ctx.drawImage(
    roiImage,
    roi.x, roi.y, roi.w, roi.h,
    roi.x, roi.y, roi.w, roi.h
  );
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = Math.max(3, c.width / 500);
  ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);
  ctx.restore();
  $('roiInfo').textContent =
    `ROI：X=${Math.round(roi.x)} px、Y=${Math.round(roi.y)} px、W=${Math.round(roi.w)} px、H=${Math.round(roi.h)} px`;
}
$('showRoiImage').onclick = async () => {
  const f = $('imageFiles').files[0];
  if (!f) return alert('先に画像を選択してください。');
  roiImage = await loadImage(f);
  const c = $('roiCanvas');
  c.width = roiImage.naturalWidth;
  c.height = roiImage.naturalHeight;

  if (!roi) {
    const w = Math.min(Number($('roiWidth').value) || 600, c.width);
    const h = Math.min(Number($('roiHeight').value) || 400, c.height);
    roi = {
      x: Math.max(0, Math.round((c.width - w) / 2)),
      y: Math.max(0, Math.round((c.height - h) / 2)),
      w, h
    };
    $('roiX').value = roi.x;
    $('roiY').value = roi.y;
  }
  drawFixedRoi();

  let dragging = false;
  let offsetX = 0, offsetY = 0;

  c.onmousedown = e => {
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) * c.width / r.width;
    const my = (e.clientY - r.top) * c.height / r.height;
    if (mx >= roi.x && mx <= roi.x + roi.w &&
        my >= roi.y && my <= roi.y + roi.h) {
      dragging = true;
      offsetX = mx - roi.x;
      offsetY = my - roi.y;
      c.style.cursor = 'grabbing';
    }
  };
  c.onmousemove = e => {
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) * c.width / r.width;
    const my = (e.clientY - r.top) * c.height / r.height;
    if (!dragging) {
      c.style.cursor =
        (mx >= roi.x && mx <= roi.x + roi.w &&
         my >= roi.y && my <= roi.y + roi.h) ? 'grab' : 'default';
      return;
    }
    roi.x = Math.max(0, Math.min(c.width - roi.w, mx - offsetX));
    roi.y = Math.max(0, Math.min(c.height - roi.h, my - offsetY));
    $('roiX').value = Math.round(roi.x);
    $('roiY').value = Math.round(roi.y);
    drawFixedRoi();
  };
  const stopDrag = () => {
    dragging = false;
    c.style.cursor = 'grab';
  };
  c.onmouseup = stopDrag;
  c.onmouseleave = stopDrag;
};
$('applyRoiNumbers').onclick = () => {
  if (!roiImage) return alert('先に画像を表示してください。');
  roi = {
    x: Number($('roiX').value) || 0,
    y: Number($('roiY').value) || 0,
    w: Number($('roiWidth').value) || 600,
    h: Number($('roiHeight').value) || 400
  };
  drawFixedRoi();
};
$('centerRoi').onclick = () => {
  if (!roiImage) return alert('先に画像を表示してください。');
  const w = Math.min(Number($('roiWidth').value) || 600, roiImage.naturalWidth);
  const h = Math.min(Number($('roiHeight').value) || 400, roiImage.naturalHeight);
  roi = {
    x: Math.round((roiImage.naturalWidth - w) / 2),
    y: Math.round((roiImage.naturalHeight - h) / 2),
    w, h
  };
  $('roiX').value = roi.x;
  $('roiY').value = roi.y;
  drawFixedRoi();
};
$('clearRoi').onclick = () => {
  roi = null;
  $('roiInfo').textContent = 'ROI未指定（パン全体を解析）';
  if (roiImage) {
    const c = $('roiCanvas');
    c.getContext('2d').drawImage(roiImage, 0, 0);
  }
};
$('runAnalysis').onclick=async()=>{
 let files=[...$('imageFiles').files];if(!files.length&&rerunFile)files=[rerunFile];
 if(!files.length)return alert('画像を選択してください');
 if(!$('analysisTreatment').value)return alert('試験区を選択してください');
 if($('analysisScope').value==='bread'&&files.length!==1)return alert('パン輪郭内の解析は、輪郭確認のため1画像ずつ実行してください。');
 if($('analysisScope').value==='bread'&&!breadMaskStateCanvas)return alert('「パン輪郭を自動検出」を押し、輪郭を確認・修正してください。');
 $('analysisResults').innerHTML='';
 try{
   await diagnosePython();
 }catch(e){
   return alert('Python OpenCVを利用できません。\n'+e.message);
 }
 for(let i=0;i<files.length;i++){
  const f=files[i];$('analysisProgressBar').style.width='2%';$('analysisProgress').textContent=`${i+1}/${files.length} ${f.name} を準備中`;
  try{
   const img=await loadImage(f),p=parameters(),prepared=p.analysis_scope==='bread'?prepareBreadImage(img,p):prepareRoiImage(img,p);
   if(p.analysis_scope==='bread'&&(!breadMaskPrepared||breadMaskPrepared.width!==prepared.canvas.width||breadMaskPrepared.height!==prepared.canvas.height))throw new Error('解析画像サイズが変わりました。パン輪郭を再検出してください。');
   prepared.originalDataUrl=await prepareOriginalImageData(img,f);
   p.scale=prepared.scale;
   setWorkerState('解析中','working');
   $('analysisProgress').textContent=`${i+1}/${files.length} ${f.name} をPython OpenCVで解析中`;
   const saved=await runPythonAnalysis({
     experiment_id:$('analysisExperiment').value,treatment_id:$('analysisTreatment').value,
     sample_code:f.name.replace(/\.[^.]+$/,''),original_filename:f.name,dpi:p.dpi,
     parameters:p,analysis_image:prepared.analysisDataUrl,bread_mask:p.analysis_scope==='bread'?breadMaskStateCanvas.toDataURL('image/png'):null,
     original_image:prepared.originalDataUrl,roi:prepared.roi,
     parent_sample_id:rerunMeta?rerunMeta.parent:null,revision_no:rerunMeta?rerunMeta.revision:1,
     metadata:{replicate_no:$('replicateNo').value,bread_type:$('breadType').value,
       formulation:$('formulation').value,production_date:$('productionDate').value,
       baking_date:$('bakingDate').value,measurement_date:$('measurementDate').value,
       operator_name:$('operatorName').value,notes:$('sampleNotes').value}
   });
   setWorkerState('利用可能','ready');
   const resultUrl=`${saved.result_image_path}?t=${Date.now()}`;
   const intermediateUrls={};Object.entries(saved.intermediates||{}).forEach(([k,v])=>intermediateUrls[k]=`${v}?t=${Date.now()}`);
   const metrics=Object.entries(saved.summary).map(([k,v])=>`<div class="metric"><b>${esc(metricLabel(k))}</b><br>${formatMetricValue(k,v)}</div>`).join('');
   const binaryAreaUrl=intermediateUrls.binary_area||'';
   const binaryViewer=binaryAreaUrl?`<figure class="result-comparison binary-image-viewer"><div class="result-view-controls"><label class="result-zoom-control">表示倍率 <input class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output>100%</output></label></div><div class="result-zoom-viewport"><div class="result-overlay-stage" data-image-width="${prepared.width}" data-image-height="${prepared.height}" style="--result-aspect:${prepared.width}/${prepared.height}"><img class="result-base-image" src="${binaryAreaUrl}" alt="二値化画像"></div></div><figcaption>二値化画像（白＝空洞・黒＝生地・灰＝解析範囲外）</figcaption></figure>`:'';
   const otherIntermediateUrls=Object.fromEntries(Object.entries(intermediateUrls).filter(([key])=>key!=='binary_area'));
   $('analysisResults').insertAdjacentHTML('beforeend',`<div class="card"><h2>${esc(f.name)} <small>${esc(saved.processed_at)}</small></h2>
    <div class="metric-grid">${metrics}</div><div class="result-grid"><figure><img src="${prepared.originalDataUrl}" alt="元画像"><figcaption>元画像</figcaption></figure><figure class="result-comparison"><div class="result-view-controls"><label class="result-opacity-control">検出結果の濃度 <input class="result-opacity-range" type="range" min="0" max="100" value="60"><output>60%</output></label><label class="result-zoom-control">表示倍率 <input class="result-zoom-range" type="range" min="25" max="300" step="5" value="100"><output>100%</output></label></div><div class="result-zoom-viewport"><div class="result-overlay-stage" data-image-width="${prepared.width}" data-image-height="${prepared.height}" style="--result-aspect:${prepared.width}/${prepared.height}"><img class="result-base-image" src="${prepared.analysisDataUrl}" alt="解析範囲の元画像"><img class="result-overlay-image" src="${resultUrl}" alt="解析結果" style="opacity:.6"></div></div><figcaption>解析結果（拡大時は画像内をスクロールできます）</figcaption></figure>${binaryViewer}</div>
    ${Object.keys(otherIntermediateUrls).length?`<details><summary>解析途中画像</summary><div class="intermediate-grid">${Object.entries(otherIntermediateUrls).map(([k,u])=>`<figure><img src="${u}"><figcaption>${esc(intermediateLabel(k))}</figcaption></figure>`).join('')}</div></details>`:''}
    <p class="notice">手動補正は「データ一覧」→「画像・結果」から開けます。</p></div>`);
  }catch(e){
   if(e.name==='AbortError'){
     $('analysisResults').insertAdjacentHTML('beforeend','<div class="notice">解析をキャンセルしました。</div>');
     break;
   }
   setWorkerState('解析エラー','error');
   $('analysisResults').insertAdjacentHTML('beforeend',`<div class="error">${esc(f.name)}: ${esc(e.message)}</div>`);
  }
 }
 rerunMeta=null;rerunFile=null;$('analysisProgressBar').style.width='100%';
 $('analysisProgress').textContent='完了しました';await refreshExperiments();await loadDashboard();
};

const sampleColumns=[
 {key:'treatment_name',label:'試験区',type:'text',visible:true},
 {key:'sample_code',label:'サンプル',type:'text',visible:true},
 {key:'replicate_no',label:'反復',type:'text',visible:true},
 {key:'bread_type',label:'パン種類',type:'text',visible:false},
 {key:'measurement_date',label:'測定日',type:'date',visible:false},
 {key:'operator_name',label:'測定者',type:'text',visible:false},
 {key:'revision_no',label:'改訂',type:'number',visible:true},
 {key:'processed_at',label:'処理日時',type:'date',visible:true},
 {key:'bread_area_mm2',label:'パン断面積(mm²)',type:'number',visible:false},
 {key:'hole_count',label:'空洞数',type:'number',visible:true},
 {key:'hole_area_mm2',label:'空洞合計面積(mm²)',type:'number',visible:false},
 {key:'porosity_percent',label:'空洞率(%)',type:'number',visible:true},
 {key:'binary_white_area_mm2',label:'二値化白領域（空洞）面積 mm²',type:'number',visible:false},
 {key:'binary_black_area_mm2',label:'二値化黒領域（生地）面積 mm²',type:'number',visible:false},
 {key:'binary_white_percent',label:'二値化白領域率 %',type:'number',visible:false},
 {key:'binary_black_percent',label:'二値化黒領域率 %',type:'number',visible:false},
 {key:'mean_hole_area_mm2',label:'平均空洞面積(mm²)',type:'number',visible:true},
 {key:'median_hole_area_mm2',label:'中央値空洞面積(mm²)',type:'number',visible:false},
 {key:'max_hole_area_mm2',label:'最大空洞面積(mm²)',type:'number',visible:false},
 {key:'mean_eq_diameter_mm',label:'平均円相当直径(mm)',type:'number',visible:true},
 {key:'small_hole_count',label:'小空洞数',type:'number',visible:false},
 {key:'medium_hole_count',label:'中空洞数',type:'number',visible:false},
 {key:'large_hole_count',label:'大空洞数',type:'number',visible:false},
 {key:'app_version',label:'解析版',type:'text',visible:false}
];
function initDataTableState(){
 if(Object.keys(dataTableState.visibleColumns).length===0){
   sampleColumns.forEach(c=>dataTableState.visibleColumns[c.key]=c.visible);
 }
 const saved=localStorage.getItem('breadDataTableState');
 if(saved){
   try{
     const v=JSON.parse(saved);
     dataTableState={...dataTableState,...v,visibleColumns:{...dataTableState.visibleColumns,...(v.visibleColumns||{})}};
   }catch(e){}
 }
 $('dataSearch').value=dataTableState.search||'';
 $('dataPageSize').value=String(dataTableState.pageSize||50);
 renderColumnPicker();
}
function saveDataTableState(){localStorage.setItem('breadDataTableState',JSON.stringify(dataTableState));}
function renderColumnPicker(){
 $('columnPickerList').innerHTML=sampleColumns.map(c=>`<label class="column-check"><input type="checkbox" data-col="${c.key}" ${dataTableState.visibleColumns[c.key]?'checked':''}> ${esc(c.label)}</label>`).join('');
 $('columnPickerList').querySelectorAll('input').forEach(cb=>cb.onchange=()=>{
   dataTableState.visibleColumns[cb.dataset.col]=cb.checked;dataTableState.page=1;saveDataTableState();renderSamplesTable();
 });
}
function compareValues(a,b,type){
 if(type==='number'){const av=Number(a),bv=Number(b);return (Number.isFinite(av)?av:-Infinity)-(Number.isFinite(bv)?bv:-Infinity);}
 if(type==='date'){const av=Date.parse(a||''),bv=Date.parse(b||'');return (Number.isFinite(av)?av:0)-(Number.isFinite(bv)?bv:0);}
 return String(a??'').localeCompare(String(b??''),'ja',{numeric:true,sensitivity:'base'});
}
function getVisibleSampleColumns(){return sampleColumns.filter(c=>dataTableState.visibleColumns[c.key]);}
function getFilteredSortedSamples(){
 const q=(dataTableState.search||'').trim().toLowerCase();
 let rows=currentSamples.filter(s=>!q||sampleColumns.some(c=>String(s[c.key]??'').toLowerCase().includes(q)));
 const col=sampleColumns.find(c=>c.key===dataTableState.sortKey)||sampleColumns[0];
 rows.sort((a,b)=>compareValues(a[col.key],b[col.key],col.type)*(dataTableState.sortDir==='asc'?1:-1));
 return rows;
}
function formatCell(v,type){
 if(v===null||v===undefined||v==='')return '';
 if(type==='number'){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:3}):esc(v);}
 return esc(v);
}
function renderSamplesTable(){
 filteredSamples=getFilteredSortedSamples();
 const total=filteredSamples.length,pageSize=dataTableState.pageSize==='all'?Math.max(1,total):Number(dataTableState.pageSize||50);
 const pageCount=Math.max(1,Math.ceil(total/pageSize));
 dataTableState.page=Math.min(Math.max(1,dataTableState.page),pageCount);
 const start=(dataTableState.page-1)*pageSize,end=Math.min(total,start+pageSize),rows=filteredSamples.slice(start,end);
 const cols=getVisibleSampleColumns();
 $('samplesTable').innerHTML=`<thead><tr><th class="select-cell"><input id="selectPageSamples" type="checkbox" title="このページをすべて選択"></th>${cols.map(c=>{
   const arrow=dataTableState.sortKey===c.key?(dataTableState.sortDir==='asc'?' ▲':' ▼'):'';
   return `<th class="sortable" data-sort="${c.key}">${esc(c.label)}${arrow}</th>`;
 }).join('')}<th>操作</th></tr></thead><tbody>`+
 rows.map(s=>`<tr class="${selectedSampleIds.has(Number(s.id))?'selected-row':''}"><td class="select-cell"><input class="sample-select" type="checkbox" data-sample-id="${s.id}" ${selectedSampleIds.has(Number(s.id))?'checked':''}></td>${cols.map(c=>`<td>${formatCell(s[c.key],c.type)}</td>`).join('')}<td class="action-cell"><button onclick="viewSavedAnalysis(${s.id})">画像・結果</button> <button onclick="showHoles(${s.id})">空洞詳細</button> <button onclick="deleteSample(${s.id})">削除</button></td></tr>`).join('')+'</tbody>';
 $('samplesTable').querySelectorAll('th.sortable').forEach(th=>th.onclick=()=>{
   const key=th.dataset.sort;if(dataTableState.sortKey===key)dataTableState.sortDir=dataTableState.sortDir==='asc'?'desc':'asc';
   else{dataTableState.sortKey=key;dataTableState.sortDir='asc';}
   dataTableState.page=1;saveDataTableState();renderSamplesTable();
 });
 const pageCheckbox=$('selectPageSamples');
 if(pageCheckbox){
   const selectedOnPage=rows.filter(s=>selectedSampleIds.has(Number(s.id))).length;
   pageCheckbox.checked=rows.length>0&&selectedOnPage===rows.length;
   pageCheckbox.indeterminate=selectedOnPage>0&&selectedOnPage<rows.length;
   pageCheckbox.onchange=()=>{
     rows.forEach(s=>pageCheckbox.checked?selectedSampleIds.add(Number(s.id)):selectedSampleIds.delete(Number(s.id)));
     renderSamplesTable();
   };
 }
 $('samplesTable').querySelectorAll('.sample-select').forEach(checkbox=>checkbox.onchange=()=>{
   const id=Number(checkbox.dataset.sampleId);
   checkbox.checked?selectedSampleIds.add(id):selectedSampleIds.delete(id);
   renderSamplesTable();
 });
 $('dataTableInfo').textContent=total?`${total}件中 ${start+1}～${end}件を表示`:'該当データはありません';
 $('dataPageIndicator').textContent=`${dataTableState.page} / ${pageCount}ページ`;
 $('dataPrevPage').disabled=dataTableState.page<=1;
 $('dataNextPage').disabled=dataTableState.page>=pageCount;
 updateSelectedSampleCount();
 saveDataTableState();
}
async function loadSamples(){
 if(!$('dataExperiment').value)return;
 const experimentId=Number($('dataExperiment').value);
 if(selectedExperimentId!==null&&selectedExperimentId!==experimentId)selectedSampleIds.clear();
 selectedExperimentId=experimentId;
 currentSamples=(await api('samples',{query:`&experiment_id=${$('dataExperiment').value}`})).items;
 const validIds=new Set(currentSamples.map(s=>Number(s.id)));
 selectedSampleIds=new Set([...selectedSampleIds].filter(id=>validIds.has(id)));
 dataTableState.page=1;renderSamplesTable();
}
$('dataExperiment').onchange=loadSamples;
$('dataSearch').oninput=e=>{dataTableState.search=e.target.value;dataTableState.page=1;renderSamplesTable();};
$('dataPageSize').onchange=e=>{dataTableState.pageSize=e.target.value==='all'?'all':Number(e.target.value);dataTableState.page=1;renderSamplesTable();};
$('dataPrevPage').onclick=()=>{if(dataTableState.page>1){dataTableState.page--;renderSamplesTable();}};
$('dataNextPage').onclick=()=>{dataTableState.page++;renderSamplesTable();};
$('resetDataTable').onclick=()=>{
 localStorage.removeItem('breadDataTableState');
 dataTableState={search:'',page:1,pageSize:50,sortKey:'processed_at',sortDir:'desc',visibleColumns:{}};
 initDataTableState();renderSamplesTable();
};
function updateSelectedSampleCount(){
 const count=selectedSampleIds.size;
 $('selectedSampleCount').textContent=`選択データ：${count}件`;
 $('analyzeSelectedSamples').disabled=count===0;
 $('editSelectedSamples').disabled=count===0;
 const selectedOption=$('statsSource').querySelector('option[value="selected"]');
 if(selectedOption)selectedOption.textContent=`データ一覧で選択したデータ（${count}件）`;
}
$('selectFilteredSamples').onclick=()=>{
 getFilteredSortedSamples().forEach(sample=>selectedSampleIds.add(Number(sample.id)));
 renderSamplesTable();
};
$('clearSelectedSamples').onclick=()=>{selectedSampleIds.clear();renderSamplesTable();};
$('editSelectedSamples').onclick=async()=>{
 if(!selectedSampleIds.size)return alert('修正するデータを選択してください。');
 if(selectedSampleIds.size>500)return alert('一度に修正できるデータは500件までです。');
 const treatments=(await api('treatments',{query:`&experiment_id=${selectedExperimentId}`})).items;
 if(!treatments.length)return alert('選択できる試験区がありません。');
 const rows=currentSamples.filter(sample=>selectedSampleIds.has(Number(sample.id)));
 const options=sample=>treatments.map(t=>`<option value="${t.id}" ${Number(t.id)===Number(sample.treatment_id)?'selected':''}>${esc(t.name)}</option>`).join('');
 $('selectedSampleEditTable').innerHTML='<thead><tr><th>ID</th><th>現在の試験区</th><th>所属試験区</th><th>サンプル名</th><th>反復</th><th>解析日時</th></tr></thead><tbody>'+rows.map(sample=>`<tr data-sample-id="${sample.id}"><td>${sample.id}</td><td>${esc(sample.treatment_name)}</td><td><select class="edit-treatment">${options(sample)}</select></td><td><input class="edit-sample-code" value="${esc(sample.sample_code)}" maxlength="200"></td><td>${esc(sample.replicate_no)}</td><td>${esc(sample.processed_at)}</td></tr>`).join('')+'</tbody>';
 $('selectedSampleEditStatus').textContent=`${rows.length}件を編集中`;
 $('selectedSampleEditPanel').classList.remove('hidden');
 $('selectedSampleEditPanel').scrollIntoView({behavior:'smooth',block:'start'});
};
$('closeSelectedSampleEditor').onclick=()=>{$('selectedSampleEditPanel').classList.add('hidden');$('selectedSampleEditStatus').textContent='';};
$('saveSelectedSampleEdits').onclick=async()=>{
 const rows=[...$('selectedSampleEditTable').querySelectorAll('tbody tr')];
 const items=rows.map(row=>({sample_id:Number(row.dataset.sampleId),treatment_id:Number(row.querySelector('.edit-treatment').value),sample_code:row.querySelector('.edit-sample-code').value.trim()}));
 if(items.some(item=>!item.sample_code))return alert('サンプル名を空欄にはできません。');
 if(!confirm(`${items.length}件の名称・所属試験区を更新しますか？`))return;
 $('saveSelectedSampleEdits').disabled=true;$('selectedSampleEditStatus').textContent='保存中…';
 try{
   const result=await api('update_samples',{method:'POST',body:{items}});
   $('selectedSampleEditStatus').textContent=`${result.updated_count}件を更新しました。`;
   await loadSamples();
   $('selectedSampleEditPanel').classList.add('hidden');
 }catch(error){$('selectedSampleEditStatus').textContent='保存できませんでした：'+error.message;alert(error.message);}
 finally{$('saveSelectedSampleEdits').disabled=false;}
};
$('analyzeSelectedSamples').onclick=async()=>{
 if(!selectedSampleIds.size)return alert('統計対象を選択してください。');
 $('statsExperiment').value=$('dataExperiment').value;
 $('statsSource').value='selected';
 updateSelectedSampleCount();
 window.breadSwitchTab('stats');
 await calculateStatistics();
};

function metricLabel(k){
 const m={bread_area_mm2:'パン断面積(mm²)',hole_count:'空洞数',hole_area_mm2:'空洞合計面積(mm²)',
 porosity_percent:'空洞率(%)',mean_hole_area_mm2:'平均空洞面積(mm²)',
 binary_white_area_mm2:'二値化白領域（空洞）面積 mm²',binary_black_area_mm2:'二値化黒領域（生地）面積 mm²',
 binary_white_percent:'二値化白領域率 %',binary_black_percent:'二値化黒領域率 %',
 median_hole_area_mm2:'空洞面積中央値(mm²)',max_hole_area_mm2:'最大空洞面積(mm²)',
 mean_eq_diameter_mm:'平均円相当直径(mm)',small_hole_count:'小空洞数',
 medium_hole_count:'中空洞数',large_hole_count:'大空洞数'};
 return m[k]||k;
}
function formatMetricValue(key,value){
 if(value===null||value===undefined||value==='')return '未計測';
 const number=Number(value||0);return ['hole_count','small_hole_count','medium_hole_count','large_hole_count'].includes(key)?number.toLocaleString('ja-JP',{maximumFractionDigits:0}):number.toLocaleString('ja-JP',{minimumFractionDigits:3,maximumFractionDigits:3});
}
function intermediateLabel(key){
 const labels={gray:'グレースケール',clahe:'CLAHE補正',threshold:'二値化',binary_area:'二値化面積集計（白=空洞・黒=生地・灰=範囲外）',morphology:'形態処理',measurement_mask:'解析範囲マスク',large_hole_contrast:'大空洞コントラスト',large_hole_mask:'大空洞補完マスク',distance:'距離変換',watershed:'Watershed分割',final_mask:'最終気泡マスク'};return labels[key]||key;
}
function applyResultZoom(figure,value){
 const viewport=figure.querySelector('.result-zoom-viewport'),stage=figure.querySelector('.result-overlay-stage');if(!viewport||!stage)return;
 const imageWidth=Math.max(1,Number(stage.dataset.imageWidth)||1),imageHeight=Math.max(1,Number(stage.dataset.imageHeight)||1),viewportWidth=Math.max(1,viewport.clientWidth),zoom=value/100;
 const displayWidth=Math.max(1,Math.round(viewportWidth*zoom)),displayHeight=Math.max(1,Math.round(displayWidth*imageHeight/imageWidth));
 stage.style.width=`${displayWidth}px`;stage.style.height=`${displayHeight}px`;stage.style.aspectRatio='auto';stage.classList.toggle('zoom-reduced',value<100);
 requestAnimationFrame(()=>{viewport.scrollLeft=Math.max(0,(stage.offsetWidth-viewport.clientWidth)/2);viewport.scrollTop=Math.max(0,(stage.offsetHeight-viewport.clientHeight)/2);});
}
document.addEventListener('input',event=>{
 const figure=event.target.closest('.result-comparison');if(!figure)return;
 if(event.target.classList.contains('result-opacity-range')){
  const value=Math.min(100,Math.max(0,Number(event.target.value)||0)),overlay=figure.querySelector('.result-overlay-image'),output=event.target.closest('label')?.querySelector('output');
  if(overlay)overlay.style.opacity=String(value/100);if(output)output.textContent=`${value}%`;
 }
 if(event.target.classList.contains('result-zoom-range')){
  const value=Math.min(300,Math.max(25,Number(event.target.value)||100)),output=event.target.closest('label')?.querySelector('output');
  applyResultZoom(figure,value);if(output)output.textContent=`${value}%`;
 }
});
function loadUrlImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('比較用画像を読み込めません。'));image.src=url;});}
async function prepareSavedResultBase(originalUrl,resultUrl,parametersData,roiData){
 const [original,result]=await Promise.all([loadUrlImage(originalUrl),loadUrlImage(resultUrl)]),canvas=$('savedResultBaseCanvas'),context=canvas.getContext('2d');
 canvas.width=result.naturalWidth;canvas.height=result.naturalHeight;
 let source={x:0,y:0,w:original.naturalWidth,h:original.naturalHeight};
 if((parametersData.analysis_scope||'rectangle')==='rectangle'&&roiData){source={x:Number(roiData.x)||0,y:Number(roiData.y)||0,w:Number(roiData.w)||original.naturalWidth,h:Number(roiData.h)||original.naturalHeight};}
 source.x=Math.max(0,Math.min(original.naturalWidth-1,source.x));source.y=Math.max(0,Math.min(original.naturalHeight-1,source.y));source.w=Math.max(1,Math.min(original.naturalWidth-source.x,source.w));source.h=Math.max(1,Math.min(original.naturalHeight-source.y,source.h));
 context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(original,source.x,source.y,source.w,source.h,0,0,canvas.width,canvas.height);
 const stage=$('savedResultOverlayStage');stage.dataset.imageWidth=String(canvas.width);stage.dataset.imageHeight=String(canvas.height);stage.style.setProperty('--result-aspect',`${canvas.width}/${canvas.height}`);
}
window.viewSavedAnalysis=async id=>{
 try{
  const s=(await api('sample',{query:`&sample_id=${id}`})).item;
  savedAnalysis=s;
  const panel=$('savedAnalysisPanel');
  $('savedAnalysisMeta').innerHTML=`<p><strong>${esc(s.sample_code)}</strong>　
   試験：${esc(s.experiment_name)}　試験区：${esc(s.treatment_name)}　
   反復：${esc(s.replicate_no||'')}　処理日時：${esc(s.processed_at)}</p>
   ${s.latest_correction_at?`<p class="notice">手動補正版あり：${esc(s.latest_correction_at)}</p>`:''}`;
  const keys=['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent',
   'binary_white_area_mm2','binary_black_area_mm2','binary_white_percent','binary_black_percent',
   'mean_hole_area_mm2','median_hole_area_mm2','max_hole_area_mm2',
   'mean_eq_diameter_mm','small_hole_count','medium_hole_count','large_hole_count'];
  $('savedAnalysisMetrics').innerHTML=keys.map(k=>`<div class="metric"><b>${metricLabel(k)}</b><br>${formatMetricValue(k,s[k])}</div>`).join('');
  const originalUrl=`${s.original_image_path}?t=${Date.now()}`,resultUrl=`${s.latest_corrected_result_path||s.result_image_path}?t=${Date.now()}`;
  $('savedOriginalImage').src=originalUrl;$('savedResultImage').src=resultUrl;$('savedResultImage').style.opacity='.6';$('savedResultOpacity').value='60';$('savedResultOpacityValue').textContent='60%';$('savedResultZoom').value='100';$('savedResultZoomValue').textContent='100%';$('savedResultOverlayStage').style.width='100%';$('savedResultOverlayStage').classList.remove('zoom-reduced');
  let p={};try{p=JSON.parse(s.parameter_json||'{}')}catch(e){}
  let roiData=null;try{roiData=s.roi_json?JSON.parse(s.roi_json):null}catch(e){}
  await prepareSavedResultBase(originalUrl,resultUrl,p,roiData);
  const binaryFigure=$('savedBinaryFigure');binaryFigure.classList.add('hidden');
  if(s.binary_area_image_path){
   const binaryUrl=`${s.binary_area_image_path}?t=${Date.now()}`;
   try{
    const binaryImage=await loadUrlImage(binaryUrl),stage=$('savedBinaryStage');
    $('savedBinaryImage').src=binaryUrl;stage.dataset.imageWidth=String(binaryImage.naturalWidth);stage.dataset.imageHeight=String(binaryImage.naturalHeight);stage.style.setProperty('--result-aspect',`${binaryImage.naturalWidth}/${binaryImage.naturalHeight}`);stage.style.width='100%';stage.classList.remove('zoom-reduced');
    $('savedBinaryZoom').value='100';$('savedBinaryZoomValue').textContent='100%';binaryFigure.classList.remove('hidden');
   }catch(_){binaryFigure.classList.add('hidden');}
  }
  const rows=[...Object.entries(p),['ROI',roiData?JSON.stringify(roiData):'未指定'],
   ['パン輪郭マスク',s.bread_mask_path||'なし'],
   ['解析バージョン',s.app_version],['改訂番号',s.revision_no]];
  $('savedParameterTable').innerHTML='<table><tr><th>項目</th><th>保存値</th></tr>'+
   rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(typeof v==='object'?JSON.stringify(v):v)}</td></tr>`).join('')+'</table>';
  panel.classList.remove('hidden');requestAnimationFrame(()=>panel.querySelectorAll('.result-comparison:not(.hidden)').forEach(figure=>applyResultZoom(figure,100)));panel.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){alert(e.message)}
};
$('closeSavedAnalysis').onclick=()=>{$('savedAnalysisPanel').classList.add('hidden');savedAnalysis=null;};
$('restoreForReanalysis').onclick=async()=>{
 if(!savedAnalysis)return;
 try{
  let p={};try{p=JSON.parse(savedAnalysis.parameter_json||'{}')}catch(e){}
  if(!p.analysis_scope)p.analysis_scope='rectangle';
  setParameters(p);
  try{roi=savedAnalysis.roi_json?JSON.parse(savedAnalysis.roi_json):null}catch(e){roi=null}
  $('analysisExperiment').value=String(savedAnalysis.experiment_id);await refreshTreatments();
  $('analysisTreatment').value=String(savedAnalysis.treatment_id);
  $('replicateNo').value=savedAnalysis.replicate_no||'';
  $('breadType').value=savedAnalysis.bread_type||'';
  $('formulation').value=savedAnalysis.formulation||'';
  $('productionDate').value=savedAnalysis.production_date||'';
  $('bakingDate').value=savedAnalysis.baking_date||'';
  $('measurementDate').value=savedAnalysis.measurement_date||'';
  $('operatorName').value=savedAnalysis.operator_name||'';
  $('sampleNotes').value=savedAnalysis.notes||'';
  const r=await fetch(savedAnalysis.original_image_path);
  if(!r.ok)throw new Error('保存済み元画像を取得できません。');
  const blob=await r.blob();
  const ext=blob.type==='image/png'?'.png':blob.type==='image/webp'?'.webp':'.jpg';
  rerunFile=new File([blob],`${savedAnalysis.sample_code}_R${Number(savedAnalysis.revision_no||1)+1}${ext}`,{type:blob.type||'image/jpeg'});
  rerunMeta={parent:savedAnalysis.parent_sample_id||savedAnalysis.id,revision:Number(savedAnalysis.revision_no||1)+1};
  if(p.analysis_scope==='bread'&&savedAnalysis.bread_mask_path){
    const image=await loadImage(rerunFile),prepared=prepareBreadImage(image,p);
    await setupBreadMaskEditor(prepared,`${savedAnalysis.bread_mask_path}?t=${Date.now()}`);
  }else if(p.analysis_scope==='bread'){
    breadMaskStateCanvas=null;breadMaskPrepared=null;$('breadMaskEditor').classList.add('hidden');
  }
  document.querySelector('[data-tab="analyze"]').click();
  $('analysisProgress').innerHTML=`<span class="notice">保存済み元画像・解析条件・${p.analysis_scope==='bread'?'パン輪郭':'ROI'}を読み込みました。必要に応じて調整して「選択画像を解析して保存」を押してください。</span>`;
 }catch(e){alert(e.message)}
};
$('openSavedManualEditor').onclick=()=>{
 if(!savedAnalysis)return;
 openManualEditor(savedAnalysis.id,`${savedAnalysis.latest_corrected_result_path||savedAnalysis.result_image_path}?t=${Date.now()}`);
};

window.showHoles=async id=>{const a=(await api('holes',{query:`&sample_id=${id}`})).items,c=['hole_number','area_mm2','eq_diameter_mm','circularity','aspect_ratio','size_class'];$('holesTable').innerHTML='<tr>'+c.map(x=>`<th>${x}</th>`).join('')+'</tr>'+a.map(v=>`<tr>${c.map(x=>`<td>${esc(v[x])}</td>`).join('')}</tr>`).join('')};
window.deleteSample=async id=>{if(confirm('削除しますか？')){await api('delete_sample',{method:'POST',body:{sample_id:id}});selectedSampleIds.delete(Number(id));await loadSamples()}};

function exportVisibleRows(){
 const cols=getVisibleSampleColumns();
 return {cols,rows:filteredSamples.map(s=>Object.fromEntries(cols.map(c=>[c.label,s[c.key]??''])))};
}
$('exportSamplesCsv').onclick=()=>{
 const {cols,rows}=exportVisibleRows();if(!rows.length)return alert('出力するデータがありません。');
 const lines=[[...cols.map(c=>c.label)],...rows.map(r=>cols.map(c=>r[c.label]))];
 const csv='\ufeff'+lines.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='filtered_samples.csv';a.click();
};
$('exportSamplesXlsx').onclick=()=>{
 const {rows}=exportVisibleRows();if(!rows.length)return alert('出力するデータがありません。');
 if(typeof XLSX==='undefined')return alert('Excel出力ライブラリが読み込まれていません。CSV出力をご利用ください。');
 const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'表示中データ');XLSX.writeFile(wb,'filtered_samples.xlsx');
};
function statsNumber(value,digits=3){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
 return Number(value).toLocaleString('ja-JP',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function statsP(value){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return '算出不可';
 const p=Number(value);return p<0.0001?'< 0.0001':p.toFixed(4);
}
function statsMark(value){
 if(value===null||value===undefined)return '—';
 const p=Number(value);return p<0.001?'***':p<0.01?'**':p<0.05?'*':'n.s.';
}
function significanceLetters(groups,pairs){
 const ordered=[...groups].sort((a,b)=>Number(b.summary.mean)-Number(a.summary.mean));
 const ids=ordered.map(group=>String(group.treatment_id));
 let columns=[new Set(ids)];
 pairs.filter(pair=>pair.significant).forEach(pair=>{
   const a=String(pair.group1_id),b=String(pair.group2_id),next=[];
   columns.forEach(column=>{
     if(column.has(a)&&column.has(b)){
       const withoutA=new Set(column);withoutA.delete(a);
       const withoutB=new Set(column);withoutB.delete(b);
       if(withoutA.size)next.push(withoutA);if(withoutB.size)next.push(withoutB);
     }else next.push(column);
   });
   const unique=[];
   next.forEach(candidate=>{
     const key=[...candidate].sort().join('|');
     if(!unique.some(item=>item.key===key))unique.push({key,set:candidate});
   });
   columns=unique.filter((item,index)=>!unique.some((other,otherIndex)=>index!==otherIndex&&[...item.set].every(id=>other.set.has(id))&&other.set.size>item.set.size)).map(item=>item.set);
 });
 columns.sort((a,b)=>Math.min(...[...a].map(id=>ids.indexOf(id)))-Math.min(...[...b].map(id=>ids.indexOf(id))));
 const letterName=index=>{let name='';do{name=String.fromCharCode(97+index%26)+name;index=Math.floor(index/26)-1;}while(index>=0);return name;};
 const result={};ids.forEach(id=>result[id]='');
 columns.forEach((column,index)=>column.forEach(id=>result[id]+=letterName(index)));
 ids.forEach(id=>{if(!result[id])result[id]='a';});
 return result;
}
function renderStatsTables(data){
 const letters=significanceLetters(data.groups,data.pairs);
 const showLetters=$('showSignificance').checked;
 $('summaryTable').innerHTML='<thead><tr><th>試験区</th><th>n</th><th>平均</th><th>中央値</th><th>標準偏差</th><th>分散</th><th>CV(%)</th><th>95%信頼区間</th><th>最小</th><th>最大</th><th>記号</th></tr></thead><tbody>'+
  data.groups.map(group=>{const s=group.summary;return `<tr><td>${esc(group.name)}</td><td>${s.n}</td><td>${statsNumber(s.mean)}</td><td>${statsNumber(s.median)}</td><td>${statsNumber(s.sd)}</td><td>${statsNumber(s.variance)}</td><td>${statsNumber(s.cv_percent)}</td><td>${s.ci_low===null?'—':`${statsNumber(s.ci_low)} ～ ${statsNumber(s.ci_high)}`}</td><td>${statsNumber(s.min)}</td><td>${statsNumber(s.max)}</td><td>${showLetters?esc(letters[String(group.treatment_id)]):'—'}</td></tr>`}).join('')+'</tbody>';
 $('testTable').innerHTML='<thead><tr><th>検定</th><th>統計量</th><th>自由度</th><th>p値</th><th>判定</th></tr></thead><tbody>'+
  (data.tests.length?data.tests.map(test=>`<tr><td>${esc(test.name)}</td><td>${esc(test.statistic_label)} = ${statsNumber(test.statistic)}</td><td>${test.df2===null?statsNumber(test.df1,2):`${statsNumber(test.df1,2)}, ${statsNumber(test.df2,2)}`}</td><td>${statsP(test.p)}</td><td>${test.p===null?'算出不可':Number(test.p)<Number(data.alpha)?`有意差あり（${statsMark(test.p)}）`:'有意差なし'}</td></tr>`).join(''):'<tr><td colspan="5">比較には2試験区以上必要です。</td></tr>')+'</tbody>';
 $('pairTable').innerHTML='<thead><tr><th>試験区1</th><th>試験区2</th><th>平均差</th><th>t</th><th>自由度</th><th>未補正p</th><th>Holm補正p</th><th>判定</th></tr></thead><tbody>'+
  (data.pairs.length?data.pairs.map(pair=>`<tr><td>${esc(pair.group1)}</td><td>${esc(pair.group2)}</td><td>${statsNumber(pair.difference)}</td><td>${statsNumber(pair.t)}</td><td>${statsNumber(pair.df,2)}</td><td>${statsP(pair.raw_p)}</td><td>${statsP(pair.holm_p)}</td><td>${pair.raw_p===null?'算出不可':pair.significant?`有意（${statsMark(pair.holm_p)}）`:'n.s.'}</td></tr>`).join(''):'<tr><td colspan="8">ペア比較はありません。</td></tr>')+'</tbody>';
}
function renderStatsChart(data){
 const canvas=$('statsChart'),box=canvas.parentElement;
 const width=Math.max(620,box.clientWidth||1000),height=420,dpr=window.devicePixelRatio||1;
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 const margin={left:75,right:25,top:55,bottom:90},plotW=width-margin.left-margin.right,plotH=height-margin.top-margin.bottom;
 const values=data.groups.flatMap(group=>group.values.map(Number));
 const ciValues=data.groups.map(group=>group.summary.ci_high===null?NaN:Number(group.summary.ci_high)).filter(Number.isFinite);
 let maximum=[...values,...ciValues].reduce((max,value)=>Number.isFinite(value)?Math.max(max,value):max,0);if(maximum<=0)maximum=1;maximum*=1.22;
 ctx.font='12px sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
 for(let tick=0;tick<=5;tick++){
   const value=maximum*tick/5,y=margin.top+plotH-(plotH*tick/5);
   ctx.strokeStyle='#dfe5eb';ctx.beginPath();ctx.moveTo(margin.left,y);ctx.lineTo(width-margin.right,y);ctx.stroke();
   ctx.fillStyle='#52606d';ctx.fillText(statsNumber(value,maximum<10?2:1),margin.left-8,y);
 }
 ctx.strokeStyle='#5f6b76';ctx.beginPath();ctx.moveTo(margin.left,margin.top);ctx.lineTo(margin.left,margin.top+plotH);ctx.lineTo(width-margin.right,margin.top+plotH);ctx.stroke();
 const colors=['#2f80c9','#df7b2d','#39a96b','#9b6cc3','#d94f70','#6b8e23','#00a6a6','#8c6d5a'];
 const slot=plotW/Math.max(1,data.groups.length),barWidth=Math.min(88,slot*0.55),letters=significanceLetters(data.groups,data.pairs);
 data.groups.forEach((group,index)=>{
   const center=margin.left+slot*(index+0.5),mean=Number(group.summary.mean),barY=margin.top+plotH-mean/maximum*plotH;
   ctx.fillStyle=colors[index%colors.length];ctx.fillRect(center-barWidth/2,barY,barWidth,margin.top+plotH-barY);
   const low=group.summary.ci_low===null?NaN:Number(group.summary.ci_low),high=group.summary.ci_high===null?NaN:Number(group.summary.ci_high);
   if(Number.isFinite(low)&&Number.isFinite(high)){
     const lowY=margin.top+plotH-Math.max(0,low)/maximum*plotH,highY=margin.top+plotH-high/maximum*plotH;
     ctx.strokeStyle='#263238';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(center,lowY);ctx.lineTo(center,highY);ctx.moveTo(center-9,lowY);ctx.lineTo(center+9,lowY);ctx.moveTo(center-9,highY);ctx.lineTo(center+9,highY);ctx.stroke();
   }
   group.values.forEach((value,pointIndex)=>{
     const jitter=((pointIndex*37+index*13)%101/100-0.5)*barWidth*0.75;
     const y=margin.top+plotH-Number(value)/maximum*plotH;
     ctx.fillStyle='rgba(20,35,50,.72)';ctx.beginPath();ctx.arc(center+jitter,y,3,0,Math.PI*2);ctx.fill();
   });
   if($('showSignificance').checked){
     const topValue=group.values.reduce((max,value)=>Math.max(max,Number(value)),Math.max(mean,Number.isFinite(high)?high:mean));
     ctx.fillStyle='#111827';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(letters[String(group.treatment_id)],center,margin.top+plotH-topValue/maximum*plotH-18);
   }
   ctx.save();ctx.translate(center,margin.top+plotH+15);ctx.rotate(data.groups.length>5?-Math.PI/5:0);ctx.fillStyle='#263238';ctx.font='12px sans-serif';ctx.textAlign=data.groups.length>5?'right':'center';ctx.textBaseline='top';ctx.fillText(group.name.length>18?group.name.slice(0,17)+'…':group.name,0,0);ctx.restore();
 });
 ctx.fillStyle='#1f2937';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(`${data.metric_label}　平均値・95%信頼区間・個別値`,margin.left+plotW/2,14);
 ctx.save();ctx.translate(16,margin.top+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText(data.metric_label,0,0);ctx.restore();
}
async function calculateStatistics(){
 const experimentId=Number($('statsExperiment').value),source=$('statsSource').value;
 if(!experimentId)return alert('試験を選択してください。');
 if(source==='selected'&&(!selectedSampleIds.size||Number(selectedExperimentId)!==experimentId))return alert('選択したデータは別の試験に属しているか、選択されていません。データ一覧から選び直してください。');
 $('statsStatus').textContent='統計量と検定結果を計算しています…';
 try{
   currentStats=await api('statistics',{method:'POST',body:{experiment_id:experimentId,metric:$('statsMetric').value,
     alpha:Number($('alpha').value)||0.05,source,sample_ids:source==='selected'?[...selectedSampleIds]:[]}});
   const sourceText=currentStats.source==='selected'?'データ一覧で選択したデータ':currentStats.source==='all'?'試験内の全履歴':'試験内の最新版';
   $('statsStatus').textContent=`${sourceText}：${currentStats.sample_count}件、${currentStats.group_count}試験区を集計しました。`;
   renderStatsTables(currentStats);renderStatsChart(currentStats);
 }catch(error){currentStats=null;$('statsStatus').textContent='計算できませんでした：'+error.message;throw error;}
}
$('calculateStats').onclick=()=>calculateStatistics().catch(error=>alert(error.message));
$('showSignificance').onchange=()=>{if(currentStats){renderStatsTables(currentStats);renderStatsChart(currentStats);}};
window.addEventListener('resize',()=>{if(currentStats){clearTimeout(window.breadStatsResizeTimer);window.breadStatsResizeTimer=setTimeout(()=>renderStatsChart(currentStats),150);}});
$('exportStatsXlsx').onclick=()=>{
 if(!currentStats)return alert('先に集計・検定を実行してください。');
 if(typeof XLSX==='undefined')return alert('Excel出力ライブラリを読み込めません。');
 const summary=currentStats.groups.map(group=>({試験区:group.name,n:group.summary.n,平均:group.summary.mean,中央値:group.summary.median,
   標準偏差:group.summary.sd,分散:group.summary.variance,'CV(%)':group.summary.cv_percent,'95%CI下限':group.summary.ci_low,'95%CI上限':group.summary.ci_high,最小:group.summary.min,最大:group.summary.max}));
 const tests=currentStats.tests.map(test=>({検定:test.name,統計量:test.statistic_label,値:test.statistic,自由度1:test.df1,自由度2:test.df2,p値:test.p,有意:test.p!==null&&Number(test.p)<currentStats.alpha?'有意':'n.s.'}));
 const pairs=currentStats.pairs.map(pair=>({試験区1:pair.group1,試験区2:pair.group2,平均差:pair.difference,t:pair.t,自由度:pair.df,未補正p:pair.raw_p,Holm補正p:pair.holm_p,判定:pair.significant?'有意':'n.s.'}));
 const raw=currentStats.groups.flatMap(group=>group.samples.map(sample=>({試験区:group.name,サンプルID:sample.id,サンプル名:sample.sample_code,反復:sample.replicate_no,改訂:sample.revision_no,処理日時:sample.processed_at,比較項目:currentStats.metric_label,値:sample.value})));
 const workbook=XLSX.utils.book_new();[['記述統計',summary],['検定結果',tests],['ペア比較',pairs],['元データ',raw]].forEach(([name,rows])=>XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),name));
 XLSX.writeFile(workbook,`bread_statistics_${currentStats.metric}.xlsx`);
};
$('exportPdfReport').onclick=()=>{if(!currentStats)return alert('先に集計・検定を実行してください。');window.print();};
$('restartWorker').onclick=async()=>{
 try{
   const d=await diagnosePython(true);
   alert(`Python OpenCVを利用できます。\nPython ${d.python_version}\nOpenCV ${d.opencv_version}\nNumPy ${d.numpy_version}`);
 }catch(e){
   alert('Python環境の診断に失敗しました。\n'+e.message);
 }
};
$('cancelAnalysis').onclick=()=>{
 if(activeAnalysisController)activeAnalysisController.abort();
 $('analysisProgress').textContent='解析要求をキャンセルしました。サーバー側処理は完了まで継続する場合があります。';
 $('analysisProgressBar').style.width='0%';
};
boot().catch(e=>{console.error(e);document.body.insertAdjacentHTML('afterbegin',`<div class="error">${esc(e.message)}</div>`)});

window.openManualEditor=async(sampleId,imagePath)=>{
 const panel=$('manualEditPanel'),canvas=$('editCanvas'),ctx=canvas.getContext('2d'),img=new Image();
 img.onload=()=>{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;ctx.drawImage(img,0,0);manualEdit={sampleId,baseImage:img,actions:[]};panel.classList.remove('hidden');panel.scrollIntoView({behavior:'smooth'});};
 img.src=imagePath;
 canvas.oncontextmenu=e=>e.preventDefault();
 canvas.onmousedown=e=>{
   if(!manualEdit.baseImage)return;
   const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;
   const radius=Number($('editBrushRadius').value)||12,mode=e.button===2?'delete':'add';
   const ctx=canvas.getContext('2d');ctx.save();
   ctx.fillStyle=mode==='add'?'rgba(0,180,0,.55)':'rgba(255,255,255,.85)';
   ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
   manualEdit.actions.push({mode,x,y,radius});
   $('manualEditStatus').textContent=`補正操作 ${manualEdit.actions.length}件`;
 };
};
$('resetManualCorrection').onclick=()=>{
 if(!manualEdit.baseImage)return;
 const c=$('editCanvas');c.getContext('2d').drawImage(manualEdit.baseImage,0,0);manualEdit.actions=[];$('manualEditStatus').textContent='補正をリセットしました。';
};
$('saveManualCorrection').onclick=async()=>{
 if(!manualEdit.sampleId)return alert('補正対象がありません。');
 const c=$('editCanvas'),r=await fetch('manual_correct.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sample_id:manualEdit.sampleId,actions:manualEdit.actions,image:c.toDataURL('image/png')})});
 const d=await r.json();if(!r.ok||!d.ok)return alert(d.error||'保存できません。');
 $('manualEditStatus').textContent='手動補正を保存しました。';alert('手動補正を保存しました。');
};
