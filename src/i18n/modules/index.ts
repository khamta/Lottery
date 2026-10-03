/**
 * ทะเบียนข้อความของ module — ไฟล์นี้เป็นของ project
 * สร้าง module ใหม่แล้วเพิ่มเข้า array นี้ (bun run new:module ทำให้เอง)
 */
import { productsMessages } from "./products";
import { lotteryMessages } from "./lottery";
import { drawsMessages } from "./draws";
import { customersMessages } from "./customers";
import { ticketsMessages } from "./tickets";
import { limitsMessages } from "./limits";
import { reportsMessages } from "./reports";
import { dealersMessages } from "./dealers";
import { whatsappMessages } from "./whatsapp";
import { membersMessages } from "./members";
import { readRulesMessages } from "./read-rules";
import { accountMessages } from "./account";

export const moduleMessages = [productsMessages, lotteryMessages, drawsMessages, customersMessages, ticketsMessages, limitsMessages, reportsMessages, dealersMessages, whatsappMessages, membersMessages, readRulesMessages, accountMessages] as const;
