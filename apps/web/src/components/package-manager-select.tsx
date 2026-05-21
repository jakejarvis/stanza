import { IconChevronDown } from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PACKAGE_MANAGERS, type PackageManager } from "@/lib/package-manager";

function NpmLogo(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#e53935"
        d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"
      />
    </svg>
  );
}

function PnpmLogo(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...props}>
      <path fill="#e0e0e0" d="M2 22h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zM12 12h8v8h-8z" />
      <path fill="#ffb300" d="M2 2h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zm0 10h8v8h-8z" />
    </svg>
  );
}

function BunLogo(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...props}>
      <path
        fill="#fff8e1"
        d="M15.696 27.002a13.73 13.73 0 0 1-9.071-3.062a8.86 8.86 0 0 1-3.6-6.505c-.252-5.091 3.813-7.747 8.748-10.455c.28-.165.537-.322.793-.48a7.8 7.8 0 0 1 3.52-1.5a2 2 0 0 1 .695.118a14.8 14.8 0 0 1 2.95 1.576c.972.6 2.182 1.348 3.707 2.173a10.14 10.14 0 0 1 5.274 6.147A8.8 8.8 0 0 1 29 17.035a8.15 8.15 0 0 1-2.525 5.959a15.6 15.6 0 0 1-10.778 4.008Z"
      />
      <path
        fill="#37474f"
        d="M16.087 6a1 1 0 0 1 .358.06l.038.013l.037.012a14.5 14.5 0 0 1 2.684 1.46a72 72 0 0 0 3.767 2.205a9.17 9.17 0 0 1 4.767 5.493A8 8 0 0 1 28 17.055a7.18 7.18 0 0 1-2.234 5.233a14.6 14.6 0 0 1-10.07 3.714a12.74 12.74 0 0 1-8.415-2.816l-.027-.024l-.029-.023a7.98 7.98 0 0 1-3.202-5.758c-.223-4.516 3.431-6.89 8.231-9.525l.027-.015l.027-.015q.389-.231.783-.474A7.4 7.4 0 0 1 16.087 6m0-2c-1.618 0-3.248 1.19-4.795 2.103c-4.52 2.481-9.56 5.41-9.267 11.376a9.9 9.9 0 0 0 3.942 7.215a14.77 14.77 0 0 0 9.73 3.308c7.122 0 14.335-4.134 14.303-10.957a9.6 9.6 0 0 0-.322-2.29a11.16 11.16 0 0 0-5.764-6.768c-3.495-1.89-5.242-3.326-6.798-3.811A3 3 0 0 0 16.086 4Z"
      />
      <path
        fill="#37474f"
        d="M19.855 20.236A.8.8 0 0 0 19.26 20h-6.514a.8.8 0 0 0-.596.236a.51.51 0 0 0-.137.463a4.37 4.37 0 0 0 1.641 2.339a4.2 4.2 0 0 0 2.349.926a4.2 4.2 0 0 0 2.343-.926a4.37 4.37 0 0 0 1.642-2.339a.5.5 0 0 0-.132-.463Z"
      />
      <ellipse cx="22.5" cy="18.5" fill="#f8bbd0" rx="2.5" ry="1.5" />
      <ellipse cx="9.5" cy="18.5" fill="#f8bbd0" rx="2.5" ry="1.5" />
      <circle cx="10" cy="16" r="2" fill="#37474f" />
      <circle cx="22" cy="16" r="2" fill="#37474f" />
      <path fill="#455a64" d="M9.996 18A2 2 0 1 0 8 15.996V16a2 2 0 0 0 1.996 2" />
      <circle cx="9" cy="15" r="1" fill="#fafafa" />
      <circle cx="21" cy="15" r="1" fill="#fafafa" />
    </svg>
  );
}

function YarnLogo(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...props}>
      <path
        fill="#0288d1"
        d="M27.575 23.967a9.9 9.9 0 0 0-3.751 1.726a22.6 22.6 0 0 1-5.537 2.504a1.55 1.55 0 0 1-.931.52a59 59 0 0 1-6.11.548c-1.102.008-1.777-.282-1.965-.735a1.49 1.49 0 0 1 .82-1.965a3.6 3.6 0 0 1-.486-.359c-.163-.162-.334-.487-.385-.367c-.213.52-.324 1.794-.897 2.366c-.786.795-2.273.53-3.153.069c-.965-.513.069-1.718.069-1.718a.69.69 0 0 1-.94-.324a4.6 4.6 0 0 1-.632-2.794a5.2 5.2 0 0 1 1.674-2.76a8.84 8.84 0 0 1 .624-4.17a9.9 9.9 0 0 1 3-3.469S7.136 11.015 7.82 9.177c.444-1.196.623-1.187.769-1.239a3.44 3.44 0 0 0 1.375-.811a4.99 4.99 0 0 1 4.178-1.607s1.094-3.357 2.12-2.7a17.4 17.4 0 0 1 1.452 2.735s1.213-.71 1.35-.445a10.74 10.74 0 0 1 .495 5.81a13.3 13.3 0 0 1-2.46 5.127c-.129.214 1.47.889 2.477 3.683c.932 2.554.103 4.699.248 4.938c.026.043.034.06.034.06s1.068.085 3.213-1.24a8.05 8.05 0 0 1 4.05-1.52a1.026 1.026 0 0 1 .453 2Z"
      />
    </svg>
  );
}

const PM_LOGOS: Record<PackageManager, ReactNode> = {
  npm: <NpmLogo />,
  pnpm: <PnpmLogo />,
  bun: <BunLogo />,
  yarn: <YarnLogo />,
};

/** Package-manager picker shown to the left of a command preview. */
export function PackageManagerSelect({
  value,
  onValueChange,
}: {
  value: PackageManager;
  onValueChange: (pm: PackageManager) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" aria-label="Package manager">
            {PM_LOGOS[value]}
            <IconChevronDown className="size-3 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onValueChange(next as PackageManager)}
        >
          {PACKAGE_MANAGERS.map((pm) => (
            <DropdownMenuRadioItem key={pm.id} value={pm.id} className="cursor-pointer">
              {PM_LOGOS[pm.id]}
              {pm.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
