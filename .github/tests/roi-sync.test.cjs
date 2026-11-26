const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/app.js','utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start+1);assert.ok(start>=0&&end>start);return source.slice(start,end);}
function fixture(){
 const elements={};
 const ctx={clearRect(){},drawImage(){},save(){},restore(){},fillRect(){},strokeRect(){}};
 const $=id=>elements[id]||=( {value:'',style:{},classList:{add(){},remove(){},toggle(){}},getContext:()=>ctx} );
 $('analysisScope').value='rectangle';$('roiWidth').value='600';$('roiHeight').value='400';
 $('imageFiles').files=[];
 const pending=new Map();
 const sandbox={$,
  document:{querySelectorAll:()=>[]},
  loadImage:file=>new Promise(resolve=>pending.set(file,resolve)),
  alert:message=>{throw Error(message)},
  updateAnalysisScopeUi:()=>{},
  breadMaskStateCanvas:null,rerunFile:null,analysisRunning:false,
  roi:null,roiImage:null,roiPreviewFile:null,roiPreviewPromise:null,roiPreviewGeneration:0
 };
 vm.createContext(sandbox);
 vm.runInContext(between('function clampRoi()','$(\'runAnalysis\').onclick'),sandbox);
 const complete=(file,w,h)=>pending.get(file)({naturalWidth:w,naturalHeight:h});
 const snapshot=()=>JSON.parse(JSON.stringify(sandbox.roi));
 return {sandbox,$,complete,snapshot};
}
test('new image resets ROI to center and uses new dimensions',async()=>{
 const {sandbox,$,complete,snapshot}=fixture(),a={},b={};
 const p=sandbox.loadRoiPreview(a);complete(a,1600,1200);await p;
 assert.deepEqual(snapshot(),{x:500,y:400,w:600,h:400});
 $('roiX').value=10;$('roiY').value=20;$('applyRoiNumbers').onclick();
 const q=sandbox.loadRoiPreview(b);complete(b,1000,800);await q;
 assert.deepEqual(snapshot(),{x:200,y:200,w:600,h:400});
});
test('saved ROI is restored instead of centered',async()=>{
 const {sandbox,$,complete,snapshot}=fixture(),file={};
 const p=sandbox.loadRoiPreview(file,{x:20,y:30,w:321,h:234});complete(file,1000,800);await p;
 assert.deepEqual(snapshot(),{x:20,y:30,w:321,h:234});
 assert.equal(Number($('roiX').value),20);
});
test('ROI cleared or smaller than default is handled safely',async()=>{
 const {sandbox,complete,snapshot,$}=fixture(),file={};
 const p=sandbox.loadRoiPreview(file);complete(file,12,10);await p;
 assert.deepEqual(snapshot(),{x:0,y:0,w:12,h:10});
 $('clearRoi').onclick();assert.equal(sandbox.roi,null);
});
test('a late image decode cannot overwrite the newer image',async()=>{
 const {sandbox,complete,snapshot}=fixture(),a={},b={};
 const p=sandbox.loadRoiPreview(a),q=sandbox.loadRoiPreview(b);
 complete(b,1000,800);await q;complete(a,1600,1200);assert.equal(await p,false);
 assert.deepEqual(snapshot(),{x:200,y:200,w:600,h:400});
});
test('saved manual editor opens its actual tab and uses an independent overlay',()=>{
 const html=fs.readFileSync('index.php','utf8');
 assert.match(source,/window\.breadSwitchTab\('analyze'\);panel\.classList\.remove\('hidden'\)/);
 assert.match(source,/openManualEditor\(lastSaved\.id,lastSaved\.resultUrl,lastSaved\.baseUrl/);
 assert.match(source,/sample_id:manualEdit\.sampleId/);
 assert.match(html,/id="manualBaseCanvas"/);
 assert.match(html,/id="manualEditOpacity"/);
 assert.match(html,/id="editCanvas"/);
});


test('saved rectangular ROI scales exactly with displayed original',()=>{
 const sandbox={};vm.createContext(sandbox);
 vm.runInContext(between('function savedRoiRectangle','function clearSavedOriginalRange'),sandbox);
 const rect=sandbox.savedRoiRectangle({x:400,y:200,w:800,h:300},2000,1000);
 assert.deepEqual(JSON.parse(JSON.stringify(rect)),{x:400,y:200,w:800,h:300});
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.savedRoiPercent(rect,2000,1000))),{left:20,top:20,width:40,height:30});
 assert.equal(sandbox.savedRoiRectangle(null,2000,1000),null);
 assert.equal(sandbox.savedRoiRectangle({x:1900,y:0,w:800,h:300},2000,1000),null);
 assert.equal(sandbox.savedRoiRectangle({x:0,y:0,w:2000,h:1000},2000,1000).w,2000);
});
test('saved bread binary mask includes black and white and excludes gray outside',()=>{
 const sandbox={};vm.createContext(sandbox);
 vm.runInContext(between('function savedRoiRectangle','function clearSavedOriginalRange'),sandbox);
 assert.equal(sandbox.savedMaskSelected(0,255,'binary'),true);
 assert.equal(sandbox.savedMaskSelected(255,255,'binary'),true);
 assert.equal(sandbox.savedMaskSelected(127,255,'binary'),false);
 assert.equal(sandbox.savedMaskSelected(255,0,'mask'),false);
 assert.equal(sandbox.savedMaskSelected(255,255,'mask'),true);
 assert.equal(sandbox.savedMaskSelected(0,255,'mask'),false);
});
test('saved original ROI markers and metadata are wired to saved detail only',()=>{
 const html=fs.readFileSync('index.php','utf8');
 assert.match(html,/id="savedRoiRect"/);
 assert.match(html,/id="savedRoiMask"/);
 assert.match(html,/id="savedOriginalCaption"/);
 const view=between('window.viewSavedAnalysis=async','$(\'restoreForReanalysis\').onclick');
 assert.doesNotMatch(view,/処理日時/);
 assert.match(view,/await showSavedOriginalRange\(s,p,roiData,original\.naturalWidth,original\.naturalHeight,generation\)/);
});


test('print helpers preserve ROI coordinates and clamp image opacity',()=>{
 const sandbox={document:{createElement:()=>({})}};vm.createContext(sandbox);
 vm.runInContext(between('function savedPrintCanvas','async function savedPrintOriginal'),sandbox);
 assert.equal(sandbox.savedPrintOpacity('60'),.6);
 assert.equal(sandbox.savedPrintOpacity('0'),0);
 assert.equal(sandbox.savedPrintOpacity('100'),1);
 assert.equal(sandbox.savedPrintOpacity('200'),1);
 assert.equal(sandbox.savedPrintOpacity('invalid'),.6);
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.savedPrintCanvas(4000,2000))),{width:2400,height:1200});
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.savedPrintCanvas(800,400))),{width:800,height:400});
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.savedPrintRoiRect({left:'20%',top:'20%',width:'40%',height:'30%'},2400,1200))),{x:480,y:240,w:960,h:360});
 assert.equal(sandbox.savedPrintRoiRect({left:'90%',top:'0%',width:'30%',height:'30%'},2400,1200),null);
});
test('print overlay uses the entire stored analysis image, not viewport zoom',async()=>{
 const calls=[],ctx={globalAlpha:1,drawImage(image,...coords){calls.push({image,coords,alpha:this.globalAlpha});}};
 const base={width:1400,height:700},overlay={naturalWidth:1400,naturalHeight:700};
 const elements={base,overlay:{src:'saved-overlay.png'}};
 const sandbox={$:id=>elements[id],document:{createElement:()=>({getContext:()=>ctx})},loadUrlImage:async()=>overlay};
 vm.createContext(sandbox);
 vm.runInContext(between('function savedPrintCanvas','async function savedPrintFigure'),sandbox);
 const canvas=await sandbox.savedPrintOverlay('base','overlay',.6);
 assert.equal(canvas.width,1400);
 assert.equal(canvas.height,700);
 assert.deepEqual(calls,[{image:base,coords:[0,0,1400,700],alpha:1},{image:overlay,coords:[0,0,1400,700],alpha:.6}]);
 assert.equal(ctx.globalAlpha,1);
});
test('saved analysis print is isolated from statistics and includes all stored parameters',()=>{
 const html=fs.readFileSync('index.php','utf8'),css=fs.readFileSync('assets/style.css','utf8');
 const print=between("$('printSavedAnalysis').onclick","$('restoreForReanalysis').onclick");
 assert.match(html,/id="printSavedAnalysis"/);
 assert.match(html,/id="savedAnalysisPrintReport"/);
 assert.match(print,/savedOriginalToggle.*checked/);
 assert.match(print,/parameterTable\.rows/);
 assert.match(print,/createTHead/);
 assert.match(print,/保存された解析条件・ROI/);
 assert.match(print,/window\.print\(\)/);
 assert.match(print,/generation!==savedViewGeneration/);
 assert.match(css,/body\.printing-saved-analysis > :not\(#savedAnalysisPrintReport\)/);
 assert.match(css,/\.saved-print-conditions thead\{display:table-header-group\}/);
 assert.match(source,/window\.addEventListener\('afterprint',clearSavedPrintReport\)/);
});


test('row edit and bulk edit share an editor without replacing checkbox selection',()=>{
 const html=fs.readFileSync('index.php','utf8');
 const editor=between('async function openSampleEditor','$(\'analyzeSelectedSamples\').onclick');
 assert.match(source,/onclick="editSample\(\$\{s\.id\}\)">修正/);
 assert.match(editor,/window\.editSample=id=>openSampleEditor\(\[id\]\)/);
 assert.match(editor,/openSampleEditor\(\[\.\.\.selectedSampleIds\]\)/);
 assert.doesNotMatch(editor,/selectedSampleIds\.(clear|add|delete)\(/);
 assert.match(editor,/api\('update_samples'/);
 assert.match(html,/空洞の最小面積\(mm²\)<input id="minArea" type="number" value="0.15"/);
 assert.match(source,/min_area_mm2:num\('minArea'\)/);
 assert.match(source,/空洞の最小面積\(mm²\) \/ min_area_mm2/);
});


test('preset apply, overwrite, save-as and delete use stable IDs and preserve other entries',async()=>{
 const elements={},calls=[],alerts=[];
 let current={dpi:300,min_area_mm2:.15,analysis_scope:'rectangle'};
 let records=[{id:7,name:'生米パン',parameter_json:'{"dpi":600,"min_area_mm2":1}'},{id:8,name:'食パン（研究標準）',parameter_json:'{"dpi":450}'}];
 const $=id=>elements[id]||=( {value:'',textContent:'',disabled:false,children:[],replaceChildren(){this.children=[];this.value='';},append(option){this.children.push(option);if(!this.value)this.value=option.value;}} );
 const sandbox={$,
  builtinPresets:{'食パン（研究標準）':{dpi:300,min_area_mm2:.15,analysis_scope:'rectangle'}},
  serverPresets:new Map(),appliedPresetKey:null,presetBusy:false,presetReady:false,presetSnapshot:null,
  document:{createElement:()=>({}),querySelectorAll:()=>[]},
  parameters:()=>({...current}),setParameters:p=>{current={...p};},
  confirm:()=>true,alert:v=>alerts.push(v),
  api:async(action,options)=>{
   calls.push({action,body:options?.body});
   const b=options?.body;
   if(action==='presets')return {items:records};
   if(action==='update_preset'){records=records.map(x=>x.id===b.preset_id?{...x,parameter_json:JSON.stringify(b.parameters)}:x);return {id:b.preset_id};}
   if(action==='save_preset'){records.push({id:9,name:b.name,parameter_json:JSON.stringify(b.parameters)});return {id:9};}
   if(action==='delete_preset'){records=records.filter(x=>x.id!==b.preset_id);return {deleted_id:b.preset_id};}
   throw Error(action);
  }
 };
 vm.createContext(sandbox);
 vm.runInContext(between('function presetEntries()','function loadImage(file)'),sandbox);
 await sandbox.loadPresets();
 assert.equal($('presetSelect').children.length,3);
 assert.equal($('deletePreset').disabled,true);
 assert.equal($('updatePreset').disabled,true);
 $('presetSelect').value='saved:7';$('presetSelect').onchange();
 assert.equal($('updatePreset').disabled,true);
 $('applyPreset').onclick();
 assert.equal(current.dpi,600);
 assert.equal(current.analysis_scope,'rectangle');
 assert.equal($('updatePreset').disabled,false);
 current.min_area_mm2=.5;sandbox.updatePresetControls();
 assert.match($('presetStatus').textContent,/未保存/);
 $('presetSelect').value='saved:8';$('presetSelect').onchange();
 assert.equal($('updatePreset').disabled,true);
 $('presetSelect').value='saved:7';$('presetSelect').onchange();
 await $('updatePreset').onclick();
 assert.equal(calls.find(x=>x.action==='update_preset').body.preset_id,7);
 assert.equal(JSON.parse(records[0].parameter_json).min_area_mm2,.5);
 assert.doesNotMatch($('presetStatus').textContent,/未保存/);
 $('presetName').value='新規';
 await $('savePreset').onclick();
 assert.equal($('presetSelect').value,'saved:9');
 assert.equal(records.length,3);
 await $('deletePreset').onclick();
 assert.equal(records.length,2);
 assert.equal(sandbox.appliedPresetKey,null);
 assert.equal(current.min_area_mm2,.5);
 assert.equal($('presetSelect').children.length,3);
 assert.ok(!sandbox.serverPresets.has('saved:9'));
 $('presetSelect').value='builtin:食パン（研究標準）';$('presetSelect').onchange();
 assert.equal($('deletePreset').disabled,true);
 assert.equal($('updatePreset').disabled,true);
});
