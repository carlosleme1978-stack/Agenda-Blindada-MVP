export type Intent = "CONFIRM"|"CANCEL"|"UNKNOWN";
export function intent(text:string):Intent{
  const t=(text||"").trim().toLowerCase();
  if(["sim","ok","confirmo","confirmado","certo"].includes(t)) return "CONFIRM";
  if(t==="não"||t==="nao"||t.includes("cancel")||t.includes("desmarcar")) return "CANCEL";
  return "UNKNOWN";
}
