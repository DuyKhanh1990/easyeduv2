import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";

function RegistrationPlaceholder({ description }: { description: string }) {
  const { t } = useLanguage();

  return (
    <section className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card p-5 sm:p-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CalendarDays className="h-5 w-5" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mySpace.calendar.registrationPreparing")}
          </h2>
          <Badge variant="secondary">{t("mySpace.calendar.comingSoon")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">
          {t("mySpace.calendar.registrationNoChanges")}
        </p>
      </div>
    </section>
  );
}

export function StudentScheduleRegistration() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">
          {t("mySpace.calendar.registrationTab")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("mySpace.calendar.registrationIntro")}
        </p>
      </header>

      <Tabs defaultValue="personal-choice" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-muted p-1 sm:w-fit">
          <TabsTrigger
            value="personal-choice"
            data-testid="tab-free-choice-registration"
            className="min-h-10 whitespace-normal rounded-lg px-3 text-xs sm:px-4 sm:text-sm"
          >
            {t("mySpace.calendar.freeChoiceTab")}
          </TabsTrigger>
          <TabsTrigger
            value="existing-schedule"
            data-testid="tab-existing-schedule-registration"
            className="min-h-10 whitespace-normal rounded-lg px-3 text-xs sm:px-4 sm:text-sm"
          >
            {t("mySpace.calendar.existingScheduleTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="personal-choice"
          forceMount
          className="mt-0 data-[state=inactive]:hidden"
        >
          <RegistrationPlaceholder
            description={t("mySpace.calendar.freeChoiceDescription")}
          />
        </TabsContent>

        <TabsContent
          value="existing-schedule"
          forceMount
          className="mt-0 data-[state=inactive]:hidden"
        >
          <RegistrationPlaceholder
            description={t("mySpace.calendar.existingScheduleDescription")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
