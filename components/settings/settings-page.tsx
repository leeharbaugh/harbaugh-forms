"use client";

import { AgentProfileForm } from "@/components/settings/agent-profile-form";
import { BrokerageProfileForm } from "@/components/settings/brokerage-profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  type BrokerageSettings,
  agentProfileInputToRow,
  brokerageProfileInputToRow,
  brokerageSettingsToAgentInput,
  brokerageSettingsToBrokerageInput,
  emptyAgentProfileInput,
  emptyBrokerageProfileInput,
  fetchActiveBrokerageSettings,
  normalizeAgentProfileInput,
  normalizeBrokerageProfileInput,
  validateAgentProfileInput,
  validateBrokerageProfileInput,
} from "@/lib/types/brokerage-settings";
import { useCallback, useEffect, useState } from "react";

export function SettingsPage() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [agentValue, setAgentValue] = useState(emptyAgentProfileInput());
  const [brokerageValue, setBrokerageValue] = useState(emptyBrokerageProfileInput());
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [isSavingBrokerage, setIsSavingBrokerage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [brokerageError, setBrokerageError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const applySettings = useCallback((settings: BrokerageSettings) => {
    setSettingsId(settings.id);
    setAgentValue(brokerageSettingsToAgentInput(settings));
    setBrokerageValue(brokerageSettingsToBrokerageInput(settings));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const supabase = createClient();
      const settings = await fetchActiveBrokerageSettings(supabase);

      if (settings) {
        applySettings(settings);
      } else {
        setSettingsId(null);
        setAgentValue(emptyAgentProfileInput());
        setBrokerageValue(emptyBrokerageProfileInput());
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load settings.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveProfileFields = async (
    row: Record<string, string | null>,
    setSaving: (value: boolean) => void,
    setError: (value: string | null) => void,
    successMessage: string,
  ) => {
    setSaving(true);
    setError(null);
    setSaveSuccess(null);

    const supabase = createClient();

    if (settingsId === null) {
      const { data, error } = await supabase
        .from("brokerage_settings")
        .insert(row)
        .select("*")
        .single();

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }

      applySettings(data as BrokerageSettings);
      setSaveSuccess(successMessage);
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("brokerage_settings")
      .update(row)
      .eq("id", settingsId)
      .eq("status", "ACTIVE")
      .select("*")
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    applySettings(data as BrokerageSettings);
    setSaveSuccess(successMessage);
    setSaving(false);
  };

  const handleSaveAgent = async () => {
    const normalized = normalizeAgentProfileInput(agentValue);
    const validationError = validateAgentProfileInput(normalized);

    if (validationError) {
      setAgentError(validationError);
      return;
    }

    await saveProfileFields(
      agentProfileInputToRow(normalized),
      setIsSavingAgent,
      setAgentError,
      "Agent profile saved.",
    );
  };

  const handleSaveBrokerage = async () => {
    const normalized = normalizeBrokerageProfileInput(brokerageValue);
    const validationError = validateBrokerageProfileInput(normalized);

    if (validationError) {
      setBrokerageError(validationError);
      return;
    }

    await saveProfileFields(
      brokerageProfileInputToRow(normalized),
      setIsSavingBrokerage,
      setBrokerageError,
      "Brokerage profile saved.",
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Default agent and brokerage information for automatic form field
          population.
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
              <CardTitle>Agent Profile</CardTitle>
              <CardDescription>
                Your default agent details for forms and agreements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentProfileForm
                value={agentValue}
                onChange={setAgentValue}
                onSubmit={() => void handleSaveAgent()}
                isSubmitting={isSavingAgent}
                error={agentError}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brokerage Profile</CardTitle>
              <CardDescription>
                Brokerage office and designated broker defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BrokerageProfileForm
                value={brokerageValue}
                onChange={setBrokerageValue}
                onSubmit={() => void handleSaveBrokerage()}
                isSubmitting={isSavingBrokerage}
                error={brokerageError}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
