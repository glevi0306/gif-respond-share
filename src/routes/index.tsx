import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    throw redirect({ to: session ? "/home" : "/auth" });
  },
  component: () => null,
});
