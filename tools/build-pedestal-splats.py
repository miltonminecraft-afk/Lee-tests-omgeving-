"""Bake standalone stone pedestals in Cycles, then sample all surfaces as Gaussians.

Run in Blender --background --factory-startup --python this_file.
No gallery source is opened or modified. These are surface-converted splats,
not a claimed photo-trained reconstruction. All six sides and bevels are sampled.
"""
from pathlib import Path
import bpy, math, json, sys, hashlib
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'.local/pedestal-marble';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'images/material-library/marble_01/4k'
STEP=.0024

def source_image(name):
    image=bpy.data.images.load(str(SOURCE/name),check_existing=True)
    # A single ungrouted slab from the CC0 source; no floor-tile seams on a plinth.
    w,h=image.size;px=np.array(image.pixels[:],dtype=np.float32).reshape(h,w,4)
    crop=px[int(h*.35):int(h*.54),int(w*.045):int(w*.27)].copy()
    result=bpy.data.images.new('Solid slab '+name,width=crop.shape[1],height=crop.shape[0])
    result.pixels.foreach_set(crop.reshape(-1));result.pack()
    if name!='map.jpg':result.colorspace_settings.name='Non-Color'
    return result

def material():
    m=bpy.data.materials.new('Honed cream marble · CC0 Poly Haven');m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');coords=n.new('ShaderNodeTexCoord')
    p.inputs['Roughness'].default_value=.55
    p.inputs['Specular IOR Level'].default_value=.32
    for file,socket in [('map.jpg','Base Color'),('roughnessMap.jpg','Roughness')]:
        tex=n.new('ShaderNodeTexImage');tex.image=source_image(file);tex.projection='BOX';tex.projection_blend=.16
        l.new(coords.outputs['Generated'],tex.inputs['Vector']);l.new(tex.outputs['Color'],p.inputs[socket])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=260;noise.inputs['Detail'].default_value=3
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=.0012
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
    normal=n.new('ShaderNodeTexImage');normal.image=source_image('normalMap.jpg');normal.projection='BOX';normal.projection_blend=.16
    l.new(coords.outputs['Generated'],normal.inputs['Vector'])
    nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bump.inputs['Normal'])
    return m

def area(name,pos,power,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()

def gaussian_export(obj,baked,target):
    mesh=obj.data;mesh.calc_loop_triangles();uvs=mesh.uv_layers.active.data
    pixels=np.array(baked.pixels[:],np.float32).reshape(baked.size[1],baked.size[0],4)
    points=[];normals=[];colors=[]
    # Regular tangent-space sampling avoids random uncovered holes in smooth stone.
    for tri in mesh.loop_triangles:
        xyz=np.array([mesh.vertices[i].co[:] for i in tri.vertices]);a,b,c=xyz
        ab=b-a;ac=c-a;length=np.linalg.norm(ab)
        if length<1e-8:continue
        t=ab/length;normal=np.cross(ab,ac);normal/=np.linalg.norm(normal);v=np.cross(normal,t)
        cx=ac@t;cy=ac@v
        if cy<1e-8:continue
        gx=np.arange(min(0,cx)+STEP*.25,max(length,cx),STEP)
        gy=np.arange(STEP*.25,cy,STEP)
        if len(gy)==0:gy=np.array([cy/3])
        if len(gx)==0:gx=np.array([(length+cx)/3])
        xx,yy=np.meshgrid(gx,gy);gamma=yy.ravel()/cy;beta=(xx.ravel()-gamma*cx)/length;alpha=1-beta-gamma
        keep=(alpha>=0)&(beta>=0)&(gamma>=0)
        weights=np.stack([alpha[keep],beta[keep],gamma[keep]],axis=1)
        if not len(weights):weights=np.array([[1/3]*3])
        points.append(weights@xyz)
        ns=np.array([mesh.corner_normals[i].vector[:] for i in tri.loops]);nn=weights@ns;nn/=np.linalg.norm(nn,axis=1)[:,None];normals.append(nn)
        uv=weights@np.array([uvs[i].uv[:] for i in tri.loops]);px=np.clip(uv[:,0]*(baked.size[0]-1),0,baked.size[0]-1);py=np.clip(uv[:,1]*(baked.size[1]-1),0,baked.size[1]-1)
        x=px.astype(int);y=py.astype(int);x1=np.minimum(x+1,baked.size[0]-1);y1=np.minimum(y+1,baked.size[1]-1)
        fx=(px-x)[:,None];fy=(py-y)[:,None]
        rgb=(pixels[y,x,:3]*(1-fx)+pixels[y,x1,:3]*fx)*(1-fy)+(pixels[y1,x,:3]*(1-fx)+pixels[y1,x1,:3]*fx)*fy
        # The native gallery uses display-space colors and no additional tonemapper.
        colors.append(np.where(rgb<=.0031308,rgb*12.92,1.055*np.maximum(rgb,0)**(1/2.4)-.055).clip(0,1))
    xyz=np.concatenate(points);normal=np.concatenate(normals);rgb=np.concatenate(colors)
    # Gaussian local Z is the very thin surface-normal axis, X/Y cover the stone.
    q=np.column_stack([1+normal[:,2],-normal[:,1],normal[:,0],np.zeros(len(normal))]);bad=np.linalg.norm(q,axis=1)<1e-6;q[bad]=[0,1,0,0];q/=np.linalg.norm(q,axis=1)[:,None]
    fields=['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']
    data=np.zeros(len(xyz),dtype=[(f,'<f4') for f in fields])
    for i,f in enumerate(['x','y','z']):data[f]=xyz[:,i]
    for i in range(3):data['f_dc_'+str(i)]=(rgb[:,i]-.5)/.28209479177387814
    data['opacity']=5;data['scale_0']=math.log(STEP*.82);data['scale_1']=math.log(STEP*.82);data['scale_2']=math.log(.00016)
    for i in range(4):data['rot_'+str(i)]=q[:,i]
    header='ply\nformat binary_little_endian 1.0\nelement vertex '+str(len(data))+'\n'+''.join('property float '+f+'\n' for f in fields)+'end_header\n'
    with target.open('wb') as f:f.write(header.encode());data.tofile(f)
    return dict(count=len(data),bounds=[xyz.min(0).tolist(),xyz.max(0).tolist()],spacing=STEP)

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.8,.75,.65,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
area('Large soft key',(-3,-4,5),250,4);area('Soft fill',(4,1,3),100,3)
scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=True
scene.render.bake.margin=24;scene.render.bake.use_clear=True
for shape in ['square','round']:
    if shape=='square':bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.52));obj=bpy.context.object;obj.dimensions=(.66,.66,1.04)
    else:bpy.ops.mesh.primitive_cylinder_add(vertices=256,radius=.33,depth=1.04,location=(0,0,.52));obj=bpy.context.object
    obj.name='Independent marble pedestal '+shape;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bevel=obj.modifiers.new('Stone edge 4mm','BEVEL');bevel.width=.004;bevel.segments=10;bpy.ops.object.modifier_apply(modifier=bevel.name)
    for poly in obj.data.polygons:poly.use_smooth=True
    mod=obj.modifiers.new('Stone weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(60),island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    mat=material();obj.data.materials.append(mat)
    baked=bpy.data.images.new('4096 Cycles stone '+shape,width=4096,height=4096,float_buffer=True)
    node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=baked;mat.node_tree.nodes.active=node
    bpy.ops.object.bake(type='DIFFUSE')
    baked.filepath_raw=str(OUT/(shape+'-bake.exr'));baked.file_format='OPEN_EXR';baked.save()
    info=gaussian_export(obj,baked,OUT/(shape+'.ply'));info.update(source='Poly Haven marble_01 CC0',method='Cycles diffuse bake to complete surface Gaussians',bakeResolution=4096,samples=96,shape=shape)
    (OUT/(shape+'.json')).write_text(json.dumps(info,indent=2));print('PEDESTAL_READY',json.dumps(info),flush=True)
    bpy.data.objects.remove(obj,do_unlink=True)
print('PEDESTALS_COMPLETE',flush=True)
