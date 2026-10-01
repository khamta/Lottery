"use client";

import * as React from "react";
import { LogOut, PlugZap, RefreshCw, ServerCrash, Smartphone } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Spinner } from "@/components/shared/loading";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { WhatsappCommand } from "@/lib/validations/whatsapp-account";
import { sendWhatsappCommand } from "../../actions";
import { statusKey, statusVariant } from "../../types";
import type { WhatsappAccountDetail } from "../types";

/**
 * สถานะการเชื่อมต่อ + QR / รหัสจับคู่ — คำสั่งที่กดส่งผ่าน mutate() (หน้าจอขยับก่อน บอททำตามภายในไม่กี่วินาที)
 */
export function ConnectionPanel({ account: initial }: { account: WhatsappAccountDetail }) {
  const { t } = useI18n();
  const { rows, mutate } = useOptimisticList([initial]);
  const account = rows[0] ?? initial;
  const [confirmLogout, setConfirmLogout] = React.useState(false);

  function send(command: WhatsappCommand) {
    const patch: Partial<WhatsappAccountDetail> =
      command === "connect"
        ? { enabled: true, status: "STARTING", lastError: null }
        : command === "logout"
          ? { status: "LOGGED_OUT", qrImage: null, pairingCode: null }
          : {};
    mutate({
      patch: { type: "update", item: { ...account, ...patch } },
      action: () => sendWhatsappCommand({ id: account.id, command }),
    });
  }

  const connected = account.status === "CONNECTED";
  const waiting = account.status === "STARTING" || (account.status === "QR" && !account.qrImage && !account.pairingCode);
  const idle = account.status === "DISCONNECTED" || account.status === "LOGGED_OUT";

  return (
    <>
      {!account.workerOnline ? (
        <Alert variant="destructive">
          <ServerCrash />
          <AlertTitle>{t("whatsapp.workerOffline")}</AlertTitle>
          <AlertDescription>{t("whatsapp.workerOfflineDesc")}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("whatsapp.connection")}
            <Badge variant={statusVariant[account.status]}>{t(statusKey[account.status])}</Badge>
          </CardTitle>
          <CardDescription>
            {connected && account.phone
              ? `+${account.phone}${account.waName ? ` · ${account.waName}` : ""}`
              : t("whatsapp.connectionDesc")}
          </CardDescription>
          {connected ? (
            <CardAction className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => send("sync")}>
                <RefreshCw /> {t("whatsapp.sync")}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {account.status === "QR" && account.qrImage ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* QR ต้องเป็นสีดำบนพื้นขาวเสมอ (รูปมีพื้นขาวในตัว) ไม่งั้นแอปสแกนไม่ได้ในธีมมืด */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={account.qrImage}
                alt={t("whatsapp.qrAlt")}
                width={256}
                height={256}
                className="size-64 rounded-lg border"
              />
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                <li>{t("whatsapp.step1")}</li>
                <li>{t("whatsapp.step2")}</li>
                <li>{t("whatsapp.step3")}</li>
                <li className="text-muted-foreground">{t("whatsapp.qrRefresh")}</li>
              </ol>
            </div>
          ) : null}

          {account.status === "QR" && account.pairingCode ? (
            <div className="space-y-3">
              <p className="font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums">{account.pairingCode}</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                <li>{t("whatsapp.step1")}</li>
                <li>{t("whatsapp.pairStep2")}</li>
                <li>{t("whatsapp.pairStep3", { phone: account.pairingPhone ?? "" })}</li>
              </ol>
            </div>
          ) : null}

          {waiting && account.workerOnline ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> {t("whatsapp.waitingBot")}
            </p>
          ) : null}

          {connected ? (
            <p className="flex items-center gap-2 text-sm">
              <Smartphone className="size-4 text-muted-foreground" />
              {t("whatsapp.connectedDesc", { reading: account.readingCount, total: account.groupCount })}
            </p>
          ) : null}

          {idle ? (
            <p className="text-sm text-muted-foreground">
              {account.lastError === "qr-timeout"
                ? t("whatsapp.qrExpired")
                : account.status === "LOGGED_OUT"
                  ? t("whatsapp.loggedOutDesc")
                  : account.enabled
                    ? t("whatsapp.reconnecting")
                    : t("whatsapp.stoppedDesc")}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {idle ? (
              <Button onClick={() => send("connect")}>
                <PlugZap /> {account.status === "LOGGED_OUT" ? t("whatsapp.scanAgain") : t("whatsapp.connect")}
              </Button>
            ) : null}
            {account.status !== "LOGGED_OUT" ? (
              <Button variant="outline" onClick={() => setConfirmLogout(true)}>
                <LogOut /> {t("whatsapp.logout")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={t("whatsapp.logoutTitle")}
        description={t("whatsapp.logoutDesc")}
        confirmText={t("whatsapp.logout")}
        onConfirm={() => {
          send("logout");
          setConfirmLogout(false);
        }}
      />
    </>
  );
}
