
let cvReady = false;
let cvPromise = null;

function post(type, data={}) { self.postMessage({type, ...data}); }
function odd(n) { n=Math.max(1,Math.round(Number(n)||1)); return n%2?n:n+1; }
function cleanup(items) { items.forEach(x=>{try{x&&x.delete&&x.delete()}catch(e){}}); }

async function ensureOpenCv() {
  if (cvReady && self.cv && cv.Mat) return;
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    let settled = false;
    const started = Date.now();
    let lastStage = '開始';

    const stage = (message, detail='') => {
      lastStage = message;
      post('init_stage', {message, detail, elapsed_ms: Date.now() - started});
    };

    const fail = (message, detail='') => {
      if (settled) return;
      settled = true;
      reject(new Error(detail ? `${message}：${detail}` : message));
    };

    const ready = () => {
      if (settled) return;
      try {
        if (self.cv && cv.Mat) {
          settled = true;
          cvReady = true;
          stage('OpenCV機能確認完了');
          post('ready', {elapsed_ms: Date.now() - started});
          resolve();
        }
      } catch (err) {
        fail('OpenCV機能確認に失敗しました', err && err.message ? err.message : String(err));
      }
    };

    try {
      stage('OpenCV.jsを読み込んでいます');

      self.Module = {
        ...(self.Module || {}),
        locateFile(path) {
          stage('WebAssemblyファイルを確認しています', path);
          return `vendor/${path}`;
        },
        onRuntimeInitialized() {
          stage('OpenCVランタイムを初期化しています');
          setTimeout(ready, 0);
        },
        print(text) {
          post('opencv_log', {level:'info', message:String(text)});
        },
        printErr(text) {
          post('opencv_log', {level:'error', message:String(text)});
        }
      };

      importScripts('vendor/opencv.js');
      stage('OpenCV.jsの読込が完了しました');

      if (self.cv && typeof self.cv.then === 'function') {
        stage('Promise形式のOpenCVを初期化しています');
        self.cv.then(instance => {
          self.cv = instance;
          ready();
        }).catch(err => fail(
          'Promise形式の初期化に失敗しました',
          err && err.message ? err.message : String(err)
        ));
      }

      if (typeof self.cv === 'function' && !self.cv.Mat) {
        stage('Factory形式のOpenCVを初期化しています');
        try {
          const result = self.cv(self.Module || {});
          if (result && typeof result.then === 'function') {
            result.then(instance => {
              self.cv = instance;
              ready();
            }).catch(err => fail(
              'Factory形式の初期化に失敗しました',
              err && err.message ? err.message : String(err)
            ));
          } else if (result) {
            self.cv = result;
            ready();
          }
        } catch (err) {
          post('opencv_log', {
            level:'error',
            message:`Factory invocation failed: ${err && err.message ? err.message : err}`
          });
        }
      }

      const poll = setInterval(() => {
        if (settled) {
          clearInterval(poll);
          return;
        }
        try {
          if (self.cv && cv.Mat) {
            clearInterval(poll);
            ready();
            return;
          }
        } catch (err) {}

        if (Date.now() - started > 120000) {
          clearInterval(poll);
          fail(
            'OpenCV Workerの起動が120秒以内に完了しませんでした',
            `最終段階=${lastStage}。opencv.jsの配布形式、WASM参照先、またはWorker制限を確認してください`
          );
        }
      }, 300);

      const heartbeat = setInterval(() => {
        if (settled) {
          clearInterval(heartbeat);
          return;
        }
        post('init_heartbeat', {message:lastStage, elapsed_ms:Date.now() - started});
      }, 2000);

    } catch (err) {
      fail('OpenCV.jsの読込に失敗しました', err && err.message ? err.message : String(err));
    }
  }).catch(err => {
    cvPromise = null;
    throw err;
  });

  return cvPromise;
}

function matToImagePayload(mat) {
  let rgba=new cv.Mat();
  if(mat.type()===cv.CV_8UC4) rgba=mat.clone();
  else if(mat.type()===cv.CV_8UC3) cv.cvtColor(mat,rgba,cv.COLOR_RGB2RGBA);
  else cv.cvtColor(mat,rgba,cv.COLOR_GRAY2RGBA);
  const data=new Uint8ClampedArray(rgba.data);
  const result={width:rgba.cols,height:rgba.rows,buffer:data.buffer};
  rgba.delete();
  return result;
}

function analyze(imageData,p){
 const src=cv.matFromImageData(imageData),out=src.clone(),gray=new cv.Mat(),enh=new cv.Mat(),blur=new cv.Mat();
 const binary=new cv.Mat(),morph=new cv.Mat(),fixed=new cv.Mat(),dist=new cv.Mat(),fg=new cv.Mat(),bg=new cv.Mat(),unknown=new cv.Mat(),markers=new cv.Mat(),rgb=new cv.Mat();
 const mats=[src,out,gray,enh,blur,binary,morph,fixed,dist,fg,bg,unknown,markers,rgb];
 try{
  post('progress',{value:8,message:'グレースケール化'});cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  post('progress',{value:16,message:'CLAHE処理'});
  if(p.use_clahe){try{const c=new cv.CLAHE(Number(p.clahe_clip)||2,new cv.Size(Number(p.clahe_tiles)||8,Number(p.clahe_tiles)||8));c.apply(gray,enh);c.delete();}catch(e){gray.copyTo(enh);}}else gray.copyTo(enh);
  const k=odd(p.blur_size);cv.GaussianBlur(enh,blur,new cv.Size(k,k),0);
  post('progress',{value:28,message:'二値化'});
  if(p.threshold_mode==='otsu')cv.threshold(blur,binary,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  else{cv.adaptiveThreshold(blur,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,odd(Math.max(3,p.adaptive_block)),Number(p.adaptive_c));if(p.threshold_mode==='combined'){cv.threshold(blur,fixed,Number(p.hole_threshold),255,cv.THRESH_BINARY_INV);cv.bitwise_or(binary,fixed,binary);}}
  binary.copyTo(morph);
  if(Number(p.open_size)>0){const q=odd(p.open_size),ker=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(q,q));cv.morphologyEx(morph,morph,cv.MORPH_OPEN,ker);ker.delete();}
  if(Number(p.close_size)>0){const q=odd(p.close_size),ker=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(q,q));cv.morphologyEx(morph,morph,cv.MORPH_CLOSE,ker);ker.delete();}
  let finalMask=morph.clone();
  if(p.use_distance){
   post('progress',{value:48,message:'Distance Transform'});
   cv.distanceTransform(morph,dist,cv.DIST_L2,5);cv.normalize(dist,dist,0,1,cv.NORM_MINMAX);cv.threshold(dist,fg,Number(p.distance_ratio),1,cv.THRESH_BINARY);fg.convertTo(fg,cv.CV_8U,255);
   const ker=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3));cv.dilate(morph,bg,ker,new cv.Point(-1,-1),Math.max(1,Number(p.background_dilate)||3));ker.delete();cv.subtract(bg,fg,unknown);
   if(p.use_watershed){
    post('progress',{value:60,message:'Watershed'});
    const labels=new cv.Mat();cv.connectedComponents(fg,labels,8,cv.CV_32S);labels.copyTo(markers);
    for(let y=0;y<markers.rows;y++)for(let x=0;x<markers.cols;x++){markers.intPtr(y,x)[0]+=1;if(unknown.ucharPtr(y,x)[0]===255)markers.intPtr(y,x)[0]=0;}
    cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.watershed(rgb,markers);finalMask.delete();finalMask=cv.Mat.zeros(markers.rows,markers.cols,cv.CV_8U);
    for(let y=0;y<markers.rows;y++)for(let x=0;x<markers.cols;x++)if(markers.intPtr(y,x)[0]>1)finalMask.ucharPtr(y,x)[0]=255;
    labels.delete();
   }else{finalMask.delete();finalMask=fg.clone();}
  }
  if(Number(p.border_margin)>0)cv.rectangle(finalMask,new cv.Point(0,0),new cv.Point(finalMask.cols-1,finalMask.rows-1),new cv.Scalar(0),Number(p.border_margin));
  post('progress',{value:72,message:'輪郭計測'});
  const contours=new cv.MatVector(),hier=new cv.Mat();cv.findContours(finalMask,contours,hier,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const mm=(25.4/Number(p.dpi))/(Number(p.scale)||1),roiArea=src.cols*src.rows*mm*mm,holes=[],acc=[];let total=0;
  for(let i=0;i<contours.size();i++){const c=contours.get(i),apx=cv.contourArea(c),area=apx*mm*mm;if(area<Number(p.min_area_mm2)||(Number(p.max_area_mm2)>0&&area>Number(p.max_area_mm2))){c.delete();continue;}const per=cv.arcLength(c,true),circ=per?4*Math.PI*apx/(per*per):0,r=cv.boundingRect(c),w=r.width*mm,h=r.height*mm,asp=Math.max(w,h)/Math.max(.000001,Math.min(w,h));if(circ<Number(p.min_circularity)||asp>Number(p.max_aspect_ratio)){c.delete();continue;}const eq=2*Math.sqrt(area/Math.PI),cls=eq<Number(p.small_limit_mm)?'小':eq<Number(p.medium_limit_mm)?'中':'大',mo=cv.moments(c),cx=mo.m00?Math.round(mo.m10/mo.m00):r.x+r.width/2,cy=mo.m00?Math.round(mo.m01/mo.m00):r.y+r.height/2,n=holes.length+1;holes.push({hole_number:n,area_mm2:area,eq_diameter_mm:eq,width_mm:w,height_mm:h,perimeter_mm:per*mm,circularity:circ,aspect_ratio:asp,size_class:cls,center_x_px:Math.round(cx/(Number(p.scale)||1)),center_y_px:Math.round(cy/(Number(p.scale)||1))});acc.push({i,n,cls,cx,cy});total+=area;c.delete();}
  const overlay=cv.Mat.zeros(src.rows,src.cols,src.type()),colors={'小':new cv.Scalar(0,210,0,150),'中':new cv.Scalar(255,110,0,160),'大':new cv.Scalar(255,0,0,170)};
  acc.forEach(a=>{cv.drawContours(overlay,contours,a.i,colors[a.cls],p.fill_contours?cv.FILLED:2);cv.drawContours(out,contours,a.i,colors[a.cls],2);if(p.show_numbers)cv.putText(out,String(a.n),new cv.Point(a.cx,a.cy),cv.FONT_HERSHEY_SIMPLEX,.38,new cv.Scalar(255,255,255,255),1);});cv.addWeighted(out,.82,overlay,.30,0,out);
  const ar=holes.map(x=>x.area_mm2).sort((a,b)=>a-b),di=holes.map(x=>x.eq_diameter_mm),n=holes.length,med=n?(n%2?ar[Math.floor(n/2)]:(ar[n/2-1]+ar[n/2])/2):0;
  const summary={bread_area_mm2:roiArea,hole_count:n,hole_area_mm2:total,porosity_percent:roiArea?total/roiArea*100:0,mean_hole_area_mm2:n?total/n:0,median_hole_area_mm2:med,max_hole_area_mm2:n?Math.max(...ar):0,mean_eq_diameter_mm:n?di.reduce((s,v)=>s+v,0)/n:0,small_hole_count:holes.filter(x=>x.size_class==='小').length,medium_hole_count:holes.filter(x=>x.size_class==='中').length,large_hole_count:holes.filter(x=>x.size_class==='大').length};
  const result=matToImagePayload(out),intermediates={};if(p.save_intermediates){intermediates.gray=matToImagePayload(gray);intermediates.clahe=matToImagePayload(enh);intermediates.binary=matToImagePayload(binary);intermediates.morph=matToImagePayload(morph);if(p.use_distance){const d8=new cv.Mat();dist.convertTo(d8,cv.CV_8U,255);intermediates.distance=matToImagePayload(d8);d8.delete();}intermediates.final_mask=matToImagePayload(finalMask);}
  overlay.delete();contours.delete();hier.delete();finalMask.delete();return{summary,holes,result,intermediates};
 }finally{cleanup(mats);}
}
self.onmessage=async e=>{
  const msg=e.data||{};
  try{
    if(msg.type==='init'){await ensureOpenCv();return;}
    if(msg.type==='analyze'){
      await ensureOpenCv();
      const imageData=new ImageData(new Uint8ClampedArray(msg.buffer),msg.width,msg.height);
      const out=analyze(imageData,msg.parameters);const transfers=[out.result.buffer];Object.values(out.intermediates||{}).forEach(v=>transfers.push(v.buffer));self.postMessage({type:'result',id:msg.id,summary:out.summary,holes:out.holes,result:out.result,intermediates:out.intermediates},transfers);
    }
  }catch(err){post('error',{id:msg.id||null,message:err&&err.message?err.message:String(err)});}
};
