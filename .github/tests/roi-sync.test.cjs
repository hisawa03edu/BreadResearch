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
