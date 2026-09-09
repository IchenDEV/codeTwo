import { useState } from "react";

import { NavigationRow } from "@/components/business/navigation-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { BUILTIN_PET } from "../../pet/store";
import { AppearanceSettings } from "../../settings/AppearanceSettings";
import { KeybindingsSettingsPage } from "../../settings/PersonalSettings";
import { PetSettings } from "../../settings/PetSettings";
import type { ThemePreference } from "../../theme";

const loadCatalog = async () =>
  Array.from({ length: 20 }, (_, index) => ({
    ...BUILTIN_PET,
    source: "petshare" as const,
    id: `fixture-${index}`,
    displayName: `Companion ${index + 1}`,
    description: "Local catalog fixture for search and overflow checks.",
  }));

export function SettingsScenario() {
  const [scheme, setScheme] = useState<ThemePreference>("light");
  return (
    <Tabs
      defaultValue="appearance"
      className="min-h-0 flex-1 flex-col overflow-y-auto p-6"
    >
      <TabsList>
        <TabsTrigger value="states">Interaction states</TabsTrigger>
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
        <TabsTrigger value="pets">Pets</TabsTrigger>
        <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
        <TabsTrigger value="json">JSON field</TabsTrigger>
        <TabsTrigger value="scroll">Bounded list</TabsTrigger>
      </TabsList>
      <TabsContent value="states" className="space-y-6">
        <div className="flex gap-3">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary action</Button>
          <Button variant="ghost">Ghost action</Button>
          <Button disabled>Disabled action</Button>
        </div>
        <div className="max-w-sm space-y-2">
          <NavigationRow
            label="Current page"
            leading={null}
            current
            onSelect={() => {}}
          />
          <NavigationRow
            label="Another page"
            leading={null}
            onSelect={() => {}}
          />
          <Input
            aria-label="Example field"
            placeholder="Readable supporting text"
          />
        </div>
        <p className="text-prose">
          正文阅读保持独立字号与行距。Reading content remains comfortable
          without enlarging toolbars.
        </p>
      </TabsContent>
      <TabsContent value="appearance">
        <AppearanceSettings value={scheme} onChange={setScheme} />
      </TabsContent>
      <TabsContent value="pets">
        <PetSettings loadCatalog={loadCatalog} />
      </TabsContent>
      <TabsContent value="shortcuts">
        <KeybindingsSettingsPage
          bindings={[
            ["run", "Mod+Enter", "Run"],
            ["cancel", "Escape", "Cancel"],
          ]}
          capturing={null}
          onCapture={() => {
            /* Preview only. */
          }}
        />
      </TabsContent>
      <TabsContent value="scroll">
        <ScrollArea className="max-h-64" data-bounded-list>
          {Array.from({ length: 50 }, (_, index) => (
            <p key={index} className="py-2">
              Row {index + 1}
            </p>
          ))}
        </ScrollArea>
        <p>Footer remains visible</p>
      </TabsContent>
      <TabsContent value="json">
        <Textarea
          aria-label="Scene JSON sizing"
          className="min-h-96 font-mono"
          defaultValue={'{\n  "id": "example"\n}'}
        />
      </TabsContent>
    </Tabs>
  );
}
