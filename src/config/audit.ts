/**
 * ชื่อ entity ใน audit log (ค่า `entity` ที่ส่งให้ logAudit) -> คีย์ i18n — ไฟล์นี้เป็นของ project
 * module ใหม่เพิ่มบรรทัดที่นี่ และเพิ่มคีย์ `auditLogs.entity<Model>` ในไฟล์ข้อความของ module
 * entity ที่ไม่มีในรายการจะแสดงชื่อดิบแทน
 */
export const auditEntityKeys: Record<string, string> = {
  User: "auditLogs.entityUser",
  Product: "auditLogs.entityProduct",
  Draw: "auditLogs.entityDraw",
  Customer: "auditLogs.entityCustomer",
  Ticket: "auditLogs.entityTicket",
  Limit: "auditLogs.entityLimit",
  Dealer: "auditLogs.entityDealer",
  WhatsappAccount: "auditLogs.entityWhatsappAccount",
  WhatsappGroup: "auditLogs.entityWhatsappGroup",
  ReadRule: "auditLogs.entityReadRule",
};
