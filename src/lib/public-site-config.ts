export const APP_NAME='Luujaaa.id';
export const PUBLIC_SITE_DEFAULTS={
 title:'Luujaaa.id — Pesan menu dengan mudah',
 description:'Lihat menu, pilih pesanan, dan ikuti status pesanan Anda melalui Luujaaa.id.',
 publicUrl:'',indexingEnabled:false,googleVerification:'',
 businessName:'Luujaaa.id',supportEmail:'',supportPhone:'',address:'',
 helpTitle:'Bantuan & ketentuan',helpIntro:'Informasi pemesanan, pembayaran, privasi, dan bantuan untuk pesanan Anda.',
 supportText:'Buka bantuan dari halaman status pesanan atau hubungi petugas cabang. Sertakan nomor pesanan dan jelaskan kendalanya; jangan mengirim kata sandi, PIN, atau OTP.',
};
export type PublicSiteConfig=typeof PUBLIC_SITE_DEFAULTS;
export function publicOrigin(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash&&u.hostname.includes('.')&&!/^(localhost|127\.|0\.|\[)/.test(u.hostname)?u.origin:'';}catch{return '';}
}
export function validatePublicSite(body:unknown):PublicSiteConfig{
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Pengaturan tidak valid');
 const input=body as Record<string,unknown>,out={...PUBLIC_SITE_DEFAULTS};
 const limits:Record<string,number>={title:100,description:300,publicUrl:240,googleVerification:200,businessName:120,supportEmail:160,supportPhone:50,address:500,helpTitle:120,helpIntro:600,supportText:2000};
 for(const [key,max] of Object.entries(limits)){
  const value=input[key]??out[key as keyof PublicSiteConfig];
  if(typeof value!=='string'||value.trim().length>max)throw new Error(`Isian ${key} tidak valid`);
  (out as unknown as Record<string,unknown>)[key]=value.trim();
 }
 if(out.title.length<3||out.description.length<20||out.helpTitle.length<3)throw new Error('Judul dan deskripsi wajib dilengkapi');
 if(out.publicUrl&&!publicOrigin(out.publicUrl))throw new Error('Domain publik harus berupa alamat HTTPS utama, tanpa path, query, atau token');
 out.publicUrl=publicOrigin(out.publicUrl);
 if(out.supportEmail&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.supportEmail))throw new Error('Email bantuan tidak valid');
 if(out.googleVerification&&!/^[a-zA-Z0-9_-]+$/.test(out.googleVerification))throw new Error('Masukkan nilai token verifikasi Google saja');
 if(input.indexingEnabled!==undefined&&typeof input.indexingEnabled!=='boolean')throw new Error('Pilihan indeks tidak valid');
 out.indexingEnabled=input.indexingEnabled===true;
 if(out.indexingEnabled&&!out.publicUrl)throw new Error('Isi domain HTTPS sebelum mengaktifkan indeks Google');
 return out;
}
