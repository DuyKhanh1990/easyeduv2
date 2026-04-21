import { Search, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocations } from "@/hooks/use-locations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ChatButton } from "@/components/chat/ChatButton";
import { useLocationFilter } from "@/hooks/use-location-filter";

export function Header() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const { data: locations } = useLocations();
  const { locationId, setLocation } = useLocationFilter();

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative hidden md:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Tìm kiếm..." 
            className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary transition-all rounded-full h-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center mr-4">
          <span className="text-sm font-medium text-muted-foreground mr-2">Cơ sở:</span>
          <Select value={locationId} onValueChange={setLocation} data-testid="select-location-filter">
            <SelectTrigger className="w-[200px] h-9 rounded-lg border-border/60 shadow-sm bg-background">
              <SelectValue placeholder="Chọn cơ sở" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả cơ sở</SelectItem>
              {locations?.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <NotificationBell />
        <ChatButton />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full overflow-hidden border border-border/50 hover:shadow-md transition-all p-0">
              <div className="w-full h-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-white font-bold text-lg">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.username}</p>
                <p className="text-xs leading-none text-muted-foreground uppercase">
                  ID: {user?.id.split('-')[0]}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:bg-destructive/10 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
