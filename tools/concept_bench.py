"""Original concept bench: round solid ends and a continuous rounded seat."""
import bpy, math

def build_bench(collection, material):
    root = bpy.data.objects.new('Concept bench · two cylinder ends and plank', None)
    collection.objects.link(root)
    root['asset_id'] = 'concept_bench'
    root['independently_editable'] = True
    root['editor_category'] = 'Furniture'
    root['length_m'] = 2.44
    root['width_m'] = .64
    root['height_m'] = .48
    # A continuous capsule outline avoids seams between the cylinder supports
    # and the plank. The underside rolls into the legs like the reference.
    vertices, faces = [], []
    radius, centre, height = .32, .90, .48
    for i in range(257):
        x = -1.22 + 2.44 * i / 256
        w = radius if abs(x) <= centre else math.sqrt(max(.000001, radius**2 - (abs(x)-centre)**2))
        t = max(0, min(1, (abs(x)-.55)/.25))
        bottom = .35 * math.sqrt(max(0, 1-t*t))
        vertices.extend([(x,-w,bottom),(x,w,bottom),(x,w,height),(x,-w,height)])
        if i:
            a,b = 4*(i-1),4*i
            for j in range(4):
                k=(j+1)%4
                faces.append((a+j,b+j,b+k,a+k))
    faces.extend([(3,2,1,0),(1024,1025,1026,1027)])
    mesh=bpy.data.meshes.new('Continuous rounded walnut bench')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('Walnut cylinder supports and connecting seat',mesh)
    collection.objects.link(obj);obj.parent=root
    walnut=material.copy();walnut.name='Concept bench walnut'
    n=walnut.node_tree.nodes;l=walnut.node_tree.links;p=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord')
    stretch=n.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(1.1,9,5)
    l.new(coord.outputs['Generated'],stretch.inputs[0])
    warp=n.new('ShaderNodeTexNoise');warp.inputs['Scale'].default_value=3;warp.inputs['Detail'].default_value=3
    l.new(coord.outputs['Generated'],warp.inputs['Vector'])
    warp_scale=n.new('ShaderNodeVectorMath');warp_scale.operation='SCALE';warp_scale.inputs['Scale'].default_value=1.7
    l.new(warp.outputs['Color'],warp_scale.inputs[0])
    distorted=n.new('ShaderNodeVectorMath');distorted.operation='ADD'
    l.new(stretch.outputs[0],distorted.inputs[0]);l.new(warp_scale.outputs[0],distorted.inputs[1])
    grain=n.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=7;grain.inputs['Detail'].default_value=5;grain.inputs['Roughness'].default_value=.7
    l.new(distorted.outputs[0],grain.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB')
    for i,(pos,color) in enumerate([(.22,(.012,.004,.0015)),(.4,(.035,.012,.004)),(.54,(.075,.029,.009)),(.65,(.135,.062,.023)),(.8,(.048,.017,.005))]):
        el=ramp.color_ramp.elements[i] if i<2 else ramp.color_ramp.elements.new(pos)
        el.position=pos;el.color=(*color,1)
    l.new(grain.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    p.inputs['Roughness'].default_value=.31
    obj.data.materials.append(walnut)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bevel=obj.modifiers.new('Hand softened edges','BEVEL');bevel.width=.012;bevel.segments=4
    bevel.limit_method='ANGLE';bevel.angle_limit=.35
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in mesh.polygons: polygon.use_smooth=True
    normals=obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');normals.keep_sharp=True;normals.weight=30
    bpy.ops.object.modifier_apply(modifier=normals.name)
    return root,obj

def export_bench(root,obj,directory):
    directory.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    material=obj.data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links
    image=bpy.data.images.new('Concept bench walnut albedo',width=2048,height=2048)
    target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
    scene=bpy.context.scene;previous_samples=scene.cycles.samples;scene.cycles.samples=16
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    scene.render.bake.margin=12
    bpy.ops.object.bake(type='DIFFUSE')
    scene.cycles.samples=previous_samples
    image.filepath_raw=str(directory/'walnut-basecolor.png');image.file_format='PNG';image.save();image.pack()
    bsdf=nodes.get('Principled BSDF')
    links.new(target.outputs['Color'],bsdf.inputs['Base Color'])
    root.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(directory/'bench.glb'),export_format='GLB',use_selection=True,export_apply=True)
    (directory/'LICENSE.txt').write_text('Original bench geometry and procedural walnut texture made for the Lee Mobero gallery from its concept reference. No third-party model dependencies.')
