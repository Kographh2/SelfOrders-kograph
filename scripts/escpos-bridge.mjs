import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";
const port=Number(process.env.ESC_POS_BRIDGE_PORT||9123),printerHost=process.env.ESC_POS_PRINTER_HOST,printerPort=Number(process.env.ESC_POS_PRINTER_PORT||9100);
const allowedOrigin=process.env.SELFORDER_ORIGIN||"",pairing=process.env.ESC_POS_PAIRING_TOKEN||"";
const ESC=Buffer.from([0x1b]),GS=Buffer.from([0x1d]);
const clean=value=>String(value??"").slice(0,500).normalize("NFKD").replace(/[^\x20-\x7e\n]/g,"?");
const line=value=>Buffer.from(clean(value)+"\n","ascii");
function ticket(order){
 const out=[ESC,Buffer.from("@"),line("SELFORDER"),line("ORDER #"+order.number),line(order.orderType==="pickup"?"PICKUP "+(order.pickupAt||""):"TABLE "+(order.tableNumber||"-")),line(order.customerName||""),line("--------------------------------")];
 for(const item of order.items){out.push(line(item.quantity+" x "+item.name));if(item.notes)out.push(line("NOTE: "+item.notes));}
 if(order.notes)out.push(line("NOTE: "+order.notes));
 out.push(line("\n\n"),GS,Buffer.from("V\x41\x00"));return Buffer.concat(out);
}
function sendToPrinter(data){return new Promise((resolve,reject)=>{
 const socket=net.createConnection({host:printerHost,port:printerPort},()=>socket.end(data));
 socket.setTimeout(5000,()=>socket.destroy(new Error("Printer timeout")));
 socket.once("error",reject);socket.once("close",hadError=>{if(!hadError)resolve();});
});}
let printing=false;
const server=http.createServer(async(req,res)=>{
 if(!allowedOrigin || req.headers.origin!==allowedOrigin){res.writeHead(403);return res.end("Origin denied");}
 res.setHeader("Access-Control-Allow-Origin",allowedOrigin);res.setHeader("Vary","Origin");
 res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type, X-Print-Token");
 if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}
 if(req.method!=="POST" || req.url!=="/print"){res.writeHead(404);return res.end();}
 const supplied=Buffer.from(String(req.headers["x-print-token"]||"")),expected=Buffer.from(pairing);
 if(expected.length<32 || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)){res.writeHead(401);return res.end("Pair this device with ESC_POS_PAIRING_TOKEN");}
 if(!printerHost){res.writeHead(503);return res.end("Printer not configured");}
 if(printing){res.writeHead(429);return res.end("Printer busy");}
 if(Number(req.headers["content-length"])>65536){res.writeHead(413);return res.end();}
 try{
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const payload=JSON.parse(Buffer.concat(chunks).toString("utf8")),order=payload.order;
  if(payload.type!=="kitchen_ticket" || !Number.isInteger(order?.number) || !Array.isArray(order.items) || order.items.length>100 || order.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)) {res.writeHead(400);return res.end("Invalid ticket");}
  if(printing){res.writeHead(429);return res.end("Printer busy");}
  printing=true;
  try{await sendToPrinter(ticket(order));}finally{printing=false;}
  res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));
 }catch{res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Printer belum merespons. Periksa perangkat sebelum mencetak ulang."}));}
});
server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=10000;
server.listen(port,"127.0.0.1",()=>console.log("ESC/POS bridge listening on localhost:"+port+"; pairing "+(pairing.length>=32?"configured":"required")));
