"use client";

import { AgentProfileForm } from "@/components/settings/agent-profile-form";
import { BrokerageProfileForm } from "@/components/settings/brokerage-profile-form";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  loadCurrentUserDataVisibility,
  saveCurrentUserOnlyMyDataPreference,
} from "@/lib/user-preferences";
import {
  type BrokerageSettings,
  brokerageProfileInputToRow,
  brokerageSettingsToBrokerageInput,
  emptyAgentProfileInput,
  emptyBrokerageProfileInput,
  fetchActiveBrokerageSettings,
  normalizeAgentProfileInput,
  normalizeBrokerageProfileInput,
  validateAgentProfileInput,
  validateBrokerageProfileInput,
} from "@/lib/types/brokerage-settings";
import {
  loadCurrentUserAgentProfile,
  saveCurrentUserAgentProfile,
  userAgentSettingsToAgentInput,
} from "@/lib/user-agent-profile";
import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canEditBrokerage, setCanEditBrokerage] = useState(false);
  const [agentProfileInactive, setAgentProfileInactive] = useState(false);
  const [agentValue, setAgentValue] = useState(emptyAgentProfileInput());
  const [brokerageValue, setBrokerageValue] = useState(emptyBrokerageProfileInput());
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [isSavingBrokerage, setIsSavingBrokerage] = useState(false);
  const [onlyMyData, setOnlyMyData] = useState(false);
  const [isSavingWorkspaceView, setIsSavingWorkspaceView] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brokerageNotice, setBrokerageNotice] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [brokerageError, setBrokerageError] = useState<string | null>(null);
  const [workspaceViewError, setWorkspaceViewError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const applyBrokerageSettings = useCallback((settings: BrokerageSettings) => {
    setSettingsId(settings.id);
    setBrokerageValue(brokerageSettingsToBrokerageInput(settings));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setBrokerageNotice(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      if (!user) {
        throw new Error("You must be signed in to manage settings.");
      }

      const visibility = await loadCurrentUserDataVisibility(supabase);
      setOnlyMyData(visibility?.onlyMyData ?? false);

      const agentProfile = await loadCurrentUserAgentProfile(supabase);
      setAgentValue(userAgentSettingsToAgentInput(agentProfile));
      setAgentProfileInactive(
        agentProfile != null && agentProfile.status !== "ACTIVE",
      );

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("primary_organization_id, app_role, status")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        throw profileError;
      }

      // Mirrors public.is_app_admin(), the only role RLS lets write this row.
      setCanEditBrokerage(
        profile?.app_role === "ADMIN" && profile?.status === "ACTIVE",
      );

      const activeOrganizationId = profile?.primary_organization_id ?? null;
      setOrganizationId(activeOrganizationId);
      if (!activeOrganizationId) {
        setSettingsId(null);
        setBrokerageValue(emptyBrokerageProfileInput());
        setBrokerageNotice(
          "Your account needs an active primary organization before brokerage settings are available.",
        );
        return;
      }

      const settings = await fetchActiveBrokerageSettings(
        supabase,
        activeOrganizationId,
      );

      if (settings) {
        applyBrokerageSettings(settings);
      } else {
        setSettingsId(null);
        setBrokerageValue(emptyBrokerageProfileInput());
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load settings.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyBrokerageSettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSaveAgent = async () => {
    const normalized = normalizeAgentProfileInput(agentValue);
    const validationError = validateAgentProfileInput(normalized);

    if (validationError) {
      setAgentError(validationError);
      return;
    }

    setIsSavingAgent(true);
    setAgentError(null);
    setSaveSuccess(null);

    try {
      const saved = await saveCurrentUserAgentProfile(createClient(), normalized);
      setAgentValue(userAgentSettingsToAgentInput(saved));
      setSaveSuccess("Your agent profile was saved.");
    } catch (error) {
      setAgentError(
        error instanceof Error ? error.message : "Failed to save your agent profile.",
      );
    } finally {
      setIsSavingAgent(false);
    }
  };

  const handleSaveBrokerage = async () => {
    const normalized = normalizeBrokerageProfileInput(brokerageValue);
    const validationError = validateBrokerageProfileInput(normalized);

    if (validationError) {
      setBrokerageError(validationError);
      return;
    }

    setIsSavingBrokerage(true);
    setBrokerageError(null);
    setSaveSuccess(null);

    if (!canEditBrokerage || !organizationId) {
      setBrokerageError("Only an administrator can change the brokerage profile.");
      setIsSavingBrokerage(false);
      return;
    }

    const supabase = createClient();
    const row = brokerageProfileInputToRow(normalized);
    const { data, error } =
      settingsId === null
        ? await supabase
            .from("brokerage_settings")
            .insert({ ...row, organization_id: organizationId })
            .select("*")
            .single()
        : await supabase
            .from("brokerage_settings")
            .update(row)
            .eq("id", settingsId)
            .eq("status", "ACTIVE")
            .eq("organization_id", organizationId)
            .select("*")
            .single();

    if (error) {
      setBrokerageError(error.message);
      setIsSavingBrokerage(false);
      return;
    }

    applyBrokerageSettings(data as BrokerageSettings);
    setSaveSuccess("Brokerage profile saved.");
    setIsSavingBrokerage(false);
  };

  const handleOnlyMyDataChange = async (checked: boolean) => {
    const previous = onlyMyData;
    setOnlyMyData(checked);
    setIsSavingWorkspaceView(true);
    setWorkspaceViewError(null);
    setSaveSuccess(null);

    try {
      await saveCurrentUserOnlyMyDataPreference(createClient(), checked);
      setSaveSuccess(
        checked
          ? "Your workspace now shows only your own data."
          : "Your workspace now shows all data available to you.",
      );
    } catch (error) {
      setOnlyMyData(previous);
      setWorkspaceViewError(
        error instanceof Error
          ? error.message
          : "Failed to save the workspace view preference.",
      );
    } finally {
      setIsSavingWorkspaceView(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your personal agent details and your brokerage&apos;s shared details,
          used to fill forms automatically.
        </p>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {saveSuccess && (
        <p className="text-sm text-muted-foreground">{saveSuccess}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Workspace View</CardTitle>
              <CardDescription>
                Choose whether the day-to-day workspace shows only records you
                own or every record available to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-3">
                <AppCheckbox
                  id="only-my-data"
                  checked={onlyMyData}
                  disabled={isSavingWorkspaceView}
                  onCheckedChange={(checked) =>
                    void handleOnlyMyDataChange(checked === true)
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="only-my-data" className="font-medium">
                    Show only my data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Filters Contacts, Properties, Packets, and representation
                    agreements to records you own. This does not change your
                    administrator access; turn it off whenever you need to see
                    other available records.
                  </p>
                </div>
              </div>
              {workspaceViewError && (
                <p className="text-sm text-destructive">{workspaceViewError}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Agent Profile</CardTitle>
              <CardDescription>
                Personal to you. Your name, license number, phone and email fill
                the agent fields on forms in packets you own. Other agents in
                your brokerage keep their own profiles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentProfileInactive ? (
                <p className="text-sm text-destructive">
                  Your agent profile is inactive. Ask an administrator to
                  reactivate it.
                </p>
              ) : (
                <AgentProfileForm
                  value={agentValue}
                  onChange={setAgentValue}
                  onSubmit={() => void handleSaveAgent()}
                  isSubmitting={isSavingAgent}
                  error={agentError}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brokerage Profile</CardTitle>
              <CardDescription>
                Shared by everyone in your brokerage: the firm and the broker of
                record.{" "}
                {canEditBrokerage
                  ? "Changes apply to every agent's forms."
                  : "Only an administrator can change it."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {brokerageNotice ? (
                <p className="text-sm text-muted-foreground">{brokerageNotice}</p>
              ) : (
                <BrokerageProfileForm
                  value={brokerageValue}
                  onChange={setBrokerageValue}
                  onSubmit={() => void handleSaveBrokerage()}
                  isSubmitting={isSavingBrokerage}
                  error={brokerageError}
                  readOnly={!canEditBrokerage}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
