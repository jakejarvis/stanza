import { IconDeviceLaptop, IconMoon, IconSun } from "@tabler/icons-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Toggle theme">
            <IconSun className="scale-100 rotate-0 text-muted-foreground transition-transform dark:scale-0 dark:-rotate-90" />
            <IconMoon className="absolute scale-0 rotate-90 text-muted-foreground transition-transform dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" closeOnClick className="cursor-pointer">
            <IconSun className="text-muted-foreground" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick className="cursor-pointer">
            <IconMoon className="text-muted-foreground" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick className="cursor-pointer">
            <IconDeviceLaptop className="text-muted-foreground" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
