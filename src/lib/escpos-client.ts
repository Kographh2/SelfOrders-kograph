import type {Order} from "@/types";
export async function sendKitchenTicketToPrinter(order:Order){
  const configured=typeof window!=="undefined"?window.localStorage.getItem("selforder_escpos_bridge"):null;
  const endpoint=configured||process.env.NEXT_PUBLIC_ESC_POS_BRIDGE_URL||"http://127.0.0.1:9123/print";
  const ticket={type:"kitchen_ticket",order:{id:order.id,number:order.order_number,createdAt:order.created_at,orderType:order.order_type,pickupAt:order.pickup_at,estimatedReadyAt:order.estimated_ready_at,tableNumber:order.table?.number,customerName:order.customer_name,notes:order.notes,items:(order.order_items||[]).map(item=>({name:item.name_snapshot,quantity:item.quantity,notes:item.notes}))}};
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(ticket)});
  if(!response.ok)throw new Error(`Print bridge merespons ${response.status}`);
}
