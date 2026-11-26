import { CalendarDays, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";
import { FreeChoiceTeacherList } from "./FreeChoiceTeacherList";
import { StudentBookingHistory } from "./StudentBookingHistory";
import { useState } from "react";

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
  const [teacherDirectoryOpen, setTeacherDirectoryOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="personal-choice" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-muted p-1 sm:w-fit">
          <TabsTrigger
            value="personal-choice"
            data-testid="tab-free-choice-registration"
            className="min-h-10 whitespace-normal rounded-lg px-3 text-xs data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
          >
            {t("mySpace.calendar.myRegistrations")}
          </TabsTrigger>
          <TabsTrigger
            value="existing-schedule"
            data-testid="tab-existing-schedule-registration"
            className="min-h-10 whitespace-normal rounded-lg px-3 text-xs data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
          >
            {t("mySpace.calendar.existingScheduleTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="personal-choice"
          className="mt-0 data-[state=inactive]:hidden"
        >
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setTeacherDirectoryOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("mySpace.calendar.newRegistration")}
              </Button>
            </div>
            <StudentBookingHistory />
          </div>
        </TabsContent>

        <TabsContent
          value="existing-schedule"
          className="mt-0 data-[state=inactive]:hidden"
        >
          <RegistrationPlaceholder
            description={t("mySpace.calendar.existingScheduleDescription")}
          />
        </TabsContent>
      </Tabs>
      <Dialog open={teacherDirectoryOpen} onOpenChange={setTeacherDirectoryOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[99vw] max-w-[99vw] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("mySpace.calendar.teacherDirectoryTitle")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FreeChoiceTeacherList />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
