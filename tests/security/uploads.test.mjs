import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {load} from './helpers.mjs';
const {safeImage}=load('src/lib/safe-image.ts');
test('upload rejects disguised SVG/HTML and large dimensions',async()=>{
 for(const bytes of ['<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>','<html>fixture</html>'])await assert.rejects(safeImage(new File([bytes],'photo.jpg',{type:'image/jpeg'})),/Format/);
 const big=await sharp({create:{width:9000,height:1,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(safeImage(new File([big],'image.png',{type:'image/png'})));
});
test('valid image bytes are resized and reencoded with no metadata',async()=>{
 const bytes=await sharp({create:{width:2100,height:100,channels:3,background:'white'}}).jpeg().withMetadata({orientation:1}).toBuffer();
 const result=await safeImage(new File([bytes],'wrong-name.txt',{type:'image/jpeg'}));
 const meta=await sharp(result).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,2048);assert.equal(meta.exif,undefined);
});
