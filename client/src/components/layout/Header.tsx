import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocations } from "@/hooks/use-locations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocationFilter } from "@/hooks/use-location-filter";
import { useLanguage } from "@/hooks/use-language";

export function Header() {
  const { data: locations } = useLocations();
  const { locationId, setLocation } = useLocationFilter();
  const { t } = useLanguage();

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative hidden md:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t("header.search")}
            className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary transition-all rounded-full h-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center mr-4">
          <span className="text-sm font-medium text-muted-foreground mr-2">{t("sidebar.location")}</span>
          <Select value={locationId} onValueChange={setLocation} data-testid="select-location-filter">
            <SelectTrigger className="w-[200px] h-9 rounded-lg border-border/60 shadow-sm bg-background">
              <SelectValue placeholder={t("header.selectBranch")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sidebar.allLocations")}</SelectItem>
              {locations?.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
