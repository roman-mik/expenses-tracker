export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      budget_settings: {
        Row: {
          household_id: string;
          monthly_cap: number;
          nudge_enabled: boolean;
          nudge_pct: number;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          monthly_cap?: number;
          nudge_enabled?: boolean;
          nudge_pct?: number;
          updated_at?: string;
        };
        Update: {
          household_id?: string;
          monthly_cap?: number;
          nudge_enabled?: boolean;
          nudge_pct?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budget_settings_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: true;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          archived: boolean;
          color: string;
          created_at: string;
          household_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          archived?: boolean;
          color: string;
          created_at?: string;
          household_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          archived?: boolean;
          color?: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          amount_minor: number;
          category_id: string | null;
          created_at: string;
          currency: string;
          household_id: string;
          id: string;
          note: string | null;
          spent_at: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          amount_minor: number;
          category_id?: string | null;
          created_at?: string;
          currency: string;
          household_id: string;
          id?: string;
          note?: string | null;
          spent_at?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          amount_minor?: number;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          household_id?: string;
          id?: string;
          note?: string | null;
          spent_at?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_accounts: {
        Row: {
          archived: boolean;
          created_at: string;
          currency: string;
          current_balance_minor: number;
          household_id: string;
          id: string;
          include_in_total: boolean;
          name: string;
          sort_order: number;
          type: string;
          updated_at: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          currency: string;
          current_balance_minor?: number;
          household_id: string;
          id?: string;
          include_in_total?: boolean;
          name: string;
          sort_order?: number;
          type: string;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          currency?: string;
          current_balance_minor?: number;
          household_id?: string;
          id?: string;
          include_in_total?: boolean;
          name?: string;
          sort_order?: number;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_accounts_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_balance_snapshots: {
        Row: {
          account_id: string;
          balance_minor: number;
          currency: string;
          expected_minor: number;
          household_id: string;
          id: string;
          note: string | null;
          recorded_at: string;
        };
        Insert: {
          account_id: string;
          balance_minor: number;
          currency: string;
          expected_minor: number;
          household_id: string;
          id?: string;
          note?: string | null;
          recorded_at?: string;
        };
        Update: {
          account_id?: string;
          balance_minor?: number;
          currency?: string;
          expected_minor?: number;
          household_id?: string;
          id?: string;
          note?: string | null;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_balance_snapshots_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'horizon_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'horizon_balance_snapshots_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_fx_rates: {
        Row: {
          as_of_date: string;
          base_code: string;
          fetched_at: string;
          quote_code: string;
          rate_e8: number;
          source: string;
        };
        Insert: {
          as_of_date: string;
          base_code: string;
          fetched_at?: string;
          quote_code: string;
          rate_e8: number;
          source: string;
        };
        Update: {
          as_of_date?: string;
          base_code?: string;
          fetched_at?: string;
          quote_code?: string;
          rate_e8?: number;
          source?: string;
        };
        Relationships: [];
      };
      horizon_holidays: {
        Row: {
          date: string;
          household_id: string;
          id: string;
          name: string;
        };
        Insert: {
          date: string;
          household_id: string;
          id?: string;
          name: string;
        };
        Update: {
          date?: string;
          household_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_holidays_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_income_schedules: {
        Row: {
          anchor_date: string | null;
          covers_period: string;
          created_at: string;
          day_of_month: number | null;
          household_id: string;
          id: string;
          income_stream_id: string;
          interval_days: number | null;
          kind: string;
          nth_weekday: number | null;
          slippage_policy: string;
          weekday: number | null;
        };
        Insert: {
          anchor_date?: string | null;
          covers_period?: string;
          created_at?: string;
          day_of_month?: number | null;
          household_id: string;
          id?: string;
          income_stream_id: string;
          interval_days?: number | null;
          kind: string;
          nth_weekday?: number | null;
          slippage_policy?: string;
          weekday?: number | null;
        };
        Update: {
          anchor_date?: string | null;
          covers_period?: string;
          created_at?: string;
          day_of_month?: number | null;
          household_id?: string;
          id?: string;
          income_stream_id?: string;
          interval_days?: number | null;
          kind?: string;
          nth_weekday?: number | null;
          slippage_policy?: string;
          weekday?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_income_schedules_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'horizon_income_schedules_income_stream_id_fkey';
            columns: ['income_stream_id'];
            isOneToOne: false;
            referencedRelation: 'horizon_income_streams';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_income_streams: {
        Row: {
          account_id: string;
          archived: boolean;
          confidence: string;
          created_at: string;
          currency: string;
          end_date: string | null;
          fixed_amount_minor: number | null;
          hourly_rate_minor: number | null;
          hours_per_day_e2: number | null;
          household_id: string;
          id: string;
          kind: string;
          name: string;
          recurrence: string;
          sort_order: number;
          start_date: string;
          taxable: boolean;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          archived?: boolean;
          confidence?: string;
          created_at?: string;
          currency: string;
          end_date?: string | null;
          fixed_amount_minor?: number | null;
          hourly_rate_minor?: number | null;
          hours_per_day_e2?: number | null;
          household_id: string;
          id?: string;
          kind: string;
          name: string;
          recurrence?: string;
          sort_order?: number;
          start_date: string;
          taxable?: boolean;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          archived?: boolean;
          confidence?: string;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          fixed_amount_minor?: number | null;
          hourly_rate_minor?: number | null;
          hours_per_day_e2?: number | null;
          household_id?: string;
          id?: string;
          kind?: string;
          name?: string;
          recurrence?: string;
          sort_order?: number;
          start_date?: string;
          taxable?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_income_streams_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'horizon_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'horizon_income_streams_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_obligation_schedules: {
        Row: {
          anchor_date: string | null;
          covers_period: string;
          created_at: string;
          day_of_month: number | null;
          household_id: string;
          id: string;
          interval_days: number | null;
          kind: string;
          nth_weekday: number | null;
          obligation_id: string;
          slippage_policy: string;
          weekday: number | null;
        };
        Insert: {
          anchor_date?: string | null;
          covers_period?: string;
          created_at?: string;
          day_of_month?: number | null;
          household_id: string;
          id?: string;
          interval_days?: number | null;
          kind: string;
          nth_weekday?: number | null;
          obligation_id: string;
          slippage_policy?: string;
          weekday?: number | null;
        };
        Update: {
          anchor_date?: string | null;
          covers_period?: string;
          created_at?: string;
          day_of_month?: number | null;
          household_id?: string;
          id?: string;
          interval_days?: number | null;
          kind?: string;
          nth_weekday?: number | null;
          obligation_id?: string;
          slippage_policy?: string;
          weekday?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_obligation_schedules_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'horizon_obligation_schedules_obligation_id_fkey';
            columns: ['obligation_id'];
            isOneToOne: false;
            referencedRelation: 'horizon_obligations';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_obligations: {
        Row: {
          account_id: string;
          amount_minor: number;
          archived: boolean;
          category: string;
          confidence: string;
          created_at: string;
          currency: string;
          end_date: string | null;
          household_id: string;
          id: string;
          name: string;
          recurrence: string;
          sort_order: number;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor: number;
          archived?: boolean;
          category: string;
          confidence?: string;
          created_at?: string;
          currency: string;
          end_date?: string | null;
          household_id: string;
          id?: string;
          name: string;
          recurrence?: string;
          sort_order?: number;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor?: number;
          archived?: boolean;
          category?: string;
          confidence?: string;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          household_id?: string;
          id?: string;
          name?: string;
          recurrence?: string;
          sort_order?: number;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_obligations_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'horizon_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'horizon_obligations_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      horizon_work_calendars: {
        Row: {
          created_at: string;
          household_id: string;
          updated_at: string;
          working_weekdays: number[];
        };
        Insert: {
          created_at?: string;
          household_id: string;
          updated_at?: string;
          working_weekdays?: number[];
        };
        Update: {
          created_at?: string;
          household_id?: string;
          updated_at?: string;
          working_weekdays?: number[];
        };
        Relationships: [
          {
            foreignKeyName: 'horizon_work_calendars_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: true;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      household_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string | null;
          household_id: string;
          redeemed_at: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          household_id: string;
          redeemed_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          household_id?: string;
          redeemed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'household_invites_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      household_members: {
        Row: {
          household_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          household_id: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          household_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          currency: string;
          horizon_reporting_currency: string;
          id: string;
          timezone: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          horizon_reporting_currency?: string;
          id?: string;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          horizon_reporting_currency?: string;
          id?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      join_attempts: {
        Row: {
          attempted_at: string;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          locale: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          locale?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          locale?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_household_id: { Args: never; Returns: string };
      delete_account: { Args: never; Returns: undefined };
      is_household_member: { Args: { hid: string }; Returns: boolean };
      join_household: { Args: { invite_code: string }; Returns: string };
      leave_household: { Args: never; Returns: string };
      same_household: { Args: { other: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
