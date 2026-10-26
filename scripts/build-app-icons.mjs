import sharp from 'sharp';
import {writeFileSync} from 'node:fs';
const source='mascot/icon/Winking Cow L Mascot Icon.png';
for(const [file,size] of [['icon-192.png',192],['icon-192x192.png',192],['icon-512x512.png',512],['apple-touch-icon.png',180],['favicon-48.png',48],['favicon-96.png',96]]){
 await sharp(source).resize(size,size,{fit:'contain',background:'#142b45'}).png().toFile('public/'+file);
}
// A separate padded, opaque icon keeps the artwork inside the maskable safe zone.
const inset=await sharp(source).resize(288,288,{fit:'contain',background:'#142b45'}).flatten({background:'#142b45'}).png().toBuffer();
await sharp({create:{width:512,height:512,channels:3,background:'#142b45'}}).composite([{input:inset,left:112,top:112}]).png().toFile('public/icon-maskable-512.png');
const png=await sharp(source).resize(48,48).png().toBuffer();
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=48;ico[7]=48;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
writeFileSync('public/favicon.ico',Buffer.concat([ico,png]));
for(const [file,size] of [['favicon.svg',48],['icon-192x192.svg',192],['icon-512x512.svg',512]]){
 const raster=await sharp(source).resize(size,size).png().toBuffer();
 writeFileSync('public/'+file,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${raster.toString('base64')}"/></svg>`);
}
console.log('Generated Luujaaa.id app, Apple, maskable and favicon assets.');
