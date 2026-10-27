import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ZbsLogoCropField } from "./ZbsLogoCropField";

type SharedZbsLogos = {
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
};

const endpoint = "/api/settings/zbs-logo-settings";
const emptyLogos: SharedZbsLogos = { logoLightUrl: null, logoDarkUrl: null };

export default function ZbsSharedLogoSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: permissions } = useMyPermissions();
  const providerPermission = permissions?.permissions["/settings#providers"];
  const canWrite = !!permissions && !permissions.isStudent && (
    permissions.isSuperAdmin || providerPermission?.canCreate === true || providerPermission?.canEdit === true
  );
  const { data, isLoading, error } = useQuery<SharedZbsLogos>({
    queryKey: [endpoint],
  });
  const [form, setForm] = useState<SharedZbsLogos>(emptyLogos);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (value: SharedZbsLogos) => {
      const response = await apiRequest("PUT", endpoint, value);
      return await response.json() as SharedZbsLogos;
    },
    onSuccess: async (saved) => {
      setForm(saved);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({ title: "Đã lưu logo ZBS dùng chung." });
    },
    onError: (cause) => toast({
      title: "Không thể lưu logo",
      description: cause instanceof Error ? cause.message : "Vui lòng thử lại.",
      variant: "destructive",
    }),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tải logo dùng chung...</div>;
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Logo ZBS dùng chung</CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">
          Tải và lưu một lần để các mẫu cần logo có thể tham chiếu dùng chung. Mỗi ảnh được cắt thành PNG 400 × 96 px.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Không tải được cấu hình logo dùng chung.
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <ZbsLogoCropField
            label="Logo giao diện sáng"
            theme="light"
            value={form.logoLightUrl}
            disabled={!canWrite || saveMutation.isPending}
            onChange={(url) => setForm((current) => ({ ...current, logoLightUrl: url }))}
          />
          <ZbsLogoCropField
            label="Logo giao diện tối"
            theme="dark"
            value={form.logoDarkUrl}
            disabled={!canWrite || saveMutation.isPending}
            onChange={(url) => setForm((current) => ({ ...current, logoDarkUrl: url }))}
          />
        </div>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Lưu logo dùng chung
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
