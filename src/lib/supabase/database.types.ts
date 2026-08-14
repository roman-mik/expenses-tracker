export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
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
          user_id: string;
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
          user_id: string;
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
          user_id?: string;
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
      household_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string | null;
          household_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          household_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          household_id?: string;
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
          id: string;
          timezone: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_household_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_household_member: {
        Args: { hid: string };
        Returns: boolean;
      };
      same_household: {
        Args: { other: string };
        Returns: boolean;
      };
      join_household: {
        Args: { invite_code: string };
        Returns: string;
      };
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
  public: {
    Enums: {},
  },
} as const;
