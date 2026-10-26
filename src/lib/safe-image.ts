import sharp from "sharp";

/** Decode the actual bytes, cap decoded pixels and remove metadata by re-encoding. */
export async function safeImage(file: File) {
  if(file.size<1 || file.size>5*1024*1024)throw new Error("Gambar maksimal 5 MB");
  const source=Buffer.from(await file.arrayBuffer());
  const jpeg=source[0]===0xff&&source[1]===0xd8&&source[2]===0xff;
  const png=source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=source.toString("ascii",0,4)==="RIFF"&&source.toString("ascii",8,12)==="WEBP";
  const gif=["GIF87a","GIF89a"].includes(source.toString("ascii",0,6));
  if(!jpeg&&!png&&!webp&&!gif)throw new Error("Format gambar tidak didukung");
  const input=sharp(source,{limitInputPixels:16_000_000,failOn:"warning",animated:false});
  const metadata=await input.metadata();
  if(!metadata.format || !["jpeg","png","webp","gif"].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width>8192 || metadata.height>8192 || (metadata.pages || 1)>1)throw new Error("Gunakan gambar JPEG, PNG, WebP, atau GIF statis hingga 16 megapiksel");
  return input.rotate().resize({width:2048,height:2048,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
}
