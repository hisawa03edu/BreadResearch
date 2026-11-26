import base64
import json
import pathlib
import subprocess
import time
import urllib.request
import urllib.error
import http.cookiejar

BASE='http://127.0.0.1:8765/'
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(action, data=None, status=200, query='', endpoint='api.php'):
    url=BASE+endpoint+'?action='+action+query
    req=urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type':'application/json'})
    try:
        with opener.open(req,timeout=15) as response:
            actual=response.status
            result=json.load(response)
    except urllib.error.HTTPError as exc:
        actual=exc.code
        result=json.load(exc)
    assert actual==status,(action,actual,status,result)
    assert bool(result.get('ok'))==(status==200),(action,result)
    return result

for _ in range(50):
    try:
        call('status')
        break
    except OSError:
        time.sleep(.2)
else:
    raise AssertionError('PHP server did not start')
call('delete_experiment',{'experiment_id':1},401)
call('login',{'password':'test-only'})
def experiment(name):
    return call('create_experiment',{'name':name})['id']
def treatment(eid,name):
    return call('create_treatment',{'experiment_id':eid,'name':name})['id']
def samples(eid):
    return call('samples',query='&experiment_id='+str(eid))['items']

png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9kAAAAASUVORK5CYII='
metrics={k:1 for k in ['bread_area_mm2','hole_count','hole_area_mm2','porosity_percent','mean_hole_area_mm2','median_hole_area_mm2','max_hole_area_mm2','mean_eq_diameter_mm','small_hole_count','medium_hole_count','large_hole_count']}
hole={k:1 for k in ['hole_number','area_mm2','eq_diameter_mm','width_mm','height_mm','perimeter_mm','circularity','aspect_ratio','center_x_px','center_y_px']}
hole['size_class']='小'
def sample(eid,tid,name,parent=None):
    return call('save_analysis',dict(experiment_id=eid,treatment_id=tid,sample_code=name,dpi=300,parameters={},summary=metrics,holes=[hole],original_image=png,result_image=png,parent_sample_id=parent,revision_no=2 if parent else 1))['sample_id']
e1=experiment('A')
e2=experiment('B')
t1=treatment(e1,'A-1')
t2=treatment(e1,'A-2')
t3=treatment(e2,'B-1')
s1=sample(e1,t1,'first')
s2=sample(e1,t1,'second',s1)
s3=sample(e2,t3,'third')
assert len(samples(e1))==2
assert int(call('treatments',query='&experiment_id='+str(e1))['items'][0]['sample_count'])==2
call('delete_treatment',{'treatment_id':t1},409)
call('delete_experiment',{'experiment_id':e1,'expected_treatment_count':2},409)
call('delete_samples',{'experiment_id':e1,'sample_ids':[s1,s3]},409)
call('delete_samples',{'experiment_id':e1,'sample_ids':[s1,999999]},409)
assert len(samples(e1))==2
call('delete_sample',status=405)
row=next(r for r in samples(e1) if int(r['id'])==s1)
paths=[pathlib.Path(row[k]) for k in ['original_image_path','result_image_path']]
correction=call('manual_correct',{'sample_id':s1,'actions':[],'image':png},endpoint='manual_correct.php')
paths.append(pathlib.Path(correction['path']))
assert all(p.is_file() for p in paths)
# Use a production-style result prefix to verify cleanup of only the matching intermediate.
old_result=paths[1]
result_path=pathlib.Path('uploads/result/analysis_20261127_010000_1234abcd_overlay.png')
old_result.rename(result_path)
paths[1]=result_path
inter=pathlib.Path('uploads/intermediate/analysis_20261127_010000_1234abcd_binary_area.png')
inter.parent.mkdir(parents=True,exist_ok=True)
inter.write_bytes(b'test')
paths.append(inter)
unrelated=inter.with_name('analysis_20261127_010000_1234abce_binary_area.png')
unrelated.write_bytes(b'test')
# Point sample 2 at the same original to verify that shared files are retained.
other=next(r for r in samples(e1) if int(r['id'])==s2)
php='''$c=require "config.php";$d=$c["db"];$p=new PDO("mysql:host=".$d["host"].";dbname=".$d["name"],$d["user"],$d["pass"]);$p->prepare("UPDATE samples SET result_image_path=? WHERE id=?")->execute([$argv[1],$argv[2]]);$p->prepare("UPDATE samples SET original_image_path=? WHERE id=?")->execute([$argv[3],$argv[4]]);'''
subprocess.run(['php','-r',php,str(result_path),str(s1),str(paths[0]),str(s2)],check=True)
assert call('delete_samples',{'experiment_id':e1,'sample_ids':[s1]})['deleted_count']==1
assert paths[0].exists()
assert not any(p.exists() for p in paths[1:])
assert unrelated.exists()
assert not call('holes',query='&sample_id='+str(s1))['items']
remaining=samples(e1)
assert len(remaining)==1 and int(remaining[0]['id'])==s2 and int(remaining[0]['parent_sample_id'])==s1
assert call('delete_sample',{'sample_id':s2})['deleted_count']==1
assert not paths[0].exists()
assert call('delete_treatment',{'treatment_id':t1})['deleted_count']==1
call('delete_experiment',{'experiment_id':e1,'expected_treatment_count':2},409)
assert call('delete_experiment',{'experiment_id':e1,'expected_treatment_count':1})['deleted_treatment_count']==1
assert len(samples(e2))==1 and int(samples(e2)[0]['id'])==s3
assert call('delete_samples',{'experiment_id':e2,'sample_ids':[s3]})['deleted_count']==1
assert call('delete_experiment',{'experiment_id':e2,'expected_treatment_count':1})['deleted_count']==1
assert not call('experiments')['items']
print('Deletion integration tests passed: authorization, guards, atomic selection, shared files, related files, revisions and empty parent removal.')


# Preset lifecycle: duplicate names do not overwrite, IDs isolate changes, and
# saved sample analysis conditions are independent of preset records.
p1=call('save_preset',{'name':'preset A','parameters':{'dpi':600,'min_area_mm2':1}})['id']
p2=call('save_preset',{'name':'preset B','parameters':{'dpi':300,'min_area_mm2':.15}})['id']
call('save_preset',{'name':'preset A','parameters':{'dpi':100}},409)
call('save_preset',{'name':'食パン（研究標準）','parameters':{'dpi':100}},409)
call('save_preset',{'name':'bad','parameters':[]},422)
assert call('update_preset',{'preset_id':p1,'parameters':{'dpi':600,'min_area_mm2':.5}})['id']==p1
entries={int(p['id']):json.loads(p['parameter_json']) for p in call('presets')['items']}
assert entries[p1]=={'dpi':600,'min_area_mm2':.5}
assert entries[p2]=={'dpi':300,'min_area_mm2':.15}
call('delete_preset',status=405)
assert call('delete_preset',{'preset_id':p1})['deleted_id']==p1
call('update_preset',{'preset_id':p1,'parameters':{'dpi':300}},404)
call('delete_preset',{'preset_id':p1},404)
assert [int(p['id']) for p in call('presets')['items']]==[p2]
print('Preset integration checks passed.')


# Treatment metadata editing retains sample IDs, images and measured values.
e=experiment('Treatment editing')
other_e=experiment('Other experiment')
ta=treatment(e,'10回区')
tb=treatment(e,'2回区')
sa=sample(e,ta,'A2')
sb=sample(e,tb,'A10')
before={int(x['id']):x for x in samples(e)}
payload={'treatment_id':ta,'experiment_id':e,'name':'3回区','display_order':10,'description':'粉砕3回'}
call('update_treatment',{**payload,'experiment_id':other_e},404)
call('update_treatment',{**payload,'display_order':1.5},422)
call('update_treatment',{**payload,'name':''},422)
call('update_treatment',status=405)
assert call('update_treatment',payload)['id']==ta
call('update_treatment',{'treatment_id':tb,'experiment_id':e,'name':'2回区','display_order':2,'description':'粉砕2回'})
updated=call('treatments',query='&experiment_id='+str(e))['items']
assert [int(x['id']) for x in updated]==[tb,ta]
assert updated[1]['name']=='3回区' and updated[1]['description']=='粉砕3回'
after=samples(e)
assert [int(x['id']) for x in after]==[sb,sa]
assert [int(x['treatment_display_order']) for x in after]==[2,10]
assert after[1]['treatment_name']=='3回区'
for row in after:
    previous=before[int(row['id'])]
    for key in ['treatment_id','sample_code','hole_count','hole_area_mm2','parameter_json','roi_json','original_image_path','result_image_path']:
        assert row[key]==previous[key],key
assert len(call('holes',query='&sample_id='+str(sa))['items'])==1
print('Treatment editing and sample display order integration checks passed.')
