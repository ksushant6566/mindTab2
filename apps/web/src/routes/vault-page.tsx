import { useParams } from "@tanstack/react-router";
import { WebVaultDetailPage, WebVaultPage } from "~/components/vault/web-vault-page";
import { WorkstationShell } from "~/components/workstation-shell";

export function VaultPage() {
    return (
        <WorkstationShell>
            <WebVaultPage />
        </WorkstationShell>
    );
}

export function VaultDetailPage() {
    const { saveId } = useParams({ from: "/vault/$saveId" });

    return (
        <WorkstationShell>
            <WebVaultDetailPage saveId={saveId} />
        </WorkstationShell>
    );
}
