// One layer identity per application. Replacing layers with the same IDs leaves
// the native director's old per-camera sort/work buffers reachable.
const applicationLayers=new WeakMap();
export function galleryLayers(pc,app){
 if(applicationLayers.has(app))return applicationLayers.get(app);
 const layers={};for(const [key,id]of [['sky',29],['outsideDepth',30],['outside',31],['room',32],['insideDepth',33],['sunlight',36],['contacts',38],['works',34],['objects',35]])layers[key]=new pc.Layer({id,name:key,clearDepthBuffer:key==='room'});
 const composition=new pc.LayerComposition();composition.pushOpaque(layers.sky);composition.pushOpaque(layers.outsideDepth);composition.pushTransparent(layers.outside);composition.pushTransparent(layers.room);composition.pushOpaque(layers.insideDepth);composition.pushTransparent(layers.sunlight);composition.pushTransparent(layers.contacts);composition.pushOpaque(layers.works);composition.pushTransparent(layers.objects);app.scene.layers=composition;
 applicationLayers.set(app,layers);return layers;
}
