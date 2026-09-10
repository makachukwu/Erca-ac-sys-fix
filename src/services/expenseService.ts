/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpenseItem, ExpenseCategory, PayrollRecord, OverallSchoolFinancials } from '../types';
import { safeStorage } from './safeStorage';
import { getTodayDateString } from './calculations';
import {
  loadExpensesFromFirestore,
} from './firebase';

const STORAGE_EXPENSES_PREFIX = 'bursar_school_expenses';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; iconName: string; color: string }[] = [
  { id: 'salary_payroll', label: 'Staff Salary & Payroll', iconName: 'Users', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'generator_fuel', label: 'Generator Fuel & Diesel', iconName: 'Fuel', color: 'bg-amber-100 text-amber-800' },
  { id: 'utilities_power', label: 'Electricity & Water Utilities', iconName: 'Zap', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'maintenance_repairs', label: 'Building Maintenance & Repairs', iconName: 'Wrench', color: 'bg-orange-100 text-orange-800' },
  { id: 'exam_printing', label: 'Exam Printing & Stationeries', iconName: 'Printer', color: 'bg-blue-100 text-blue-800' },
  { id: 'teaching_materials', label: 'Teaching & Classroom Materials', iconName: 'BookOpen', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'events_sports', label: 'Sports, Excursions & Events', iconName: 'Award', color: 'bg-purple-100 text-purple-800' },
  { id: 'security_sanitation', label: 'Security & Sanitation Supplies', iconName: 'Shield', color: 'bg-cyan-100 text-cyan-800' },
  { id: 'government_levy', label: 'Govt. Levies, Taxes & Permits', iconName: 'Building', color: 'bg-rose-100 text-rose-800' },
  { id: 'administrative_supplies', label: 'Admin Office Supplies & Internet', iconName: 'FileSpreadsheet', color: 'bg-slate-100 text-slate-800' },
  { id: 'other', label: 'General / Miscellaneous Expense', iconName: 'Layers', color: 'bg-neutral-100 text-neutral-800' },
];

export function getExpenseCategoryLabel(category: ExpenseCategory): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.id === category);
  return found?.label || 'General Expense';
}

/**
 * Normalizes any category string into a valid ExpenseCategory enum id
 */
export function parseExpenseCategory(val: any): ExpenseCategory {
  if (!val) return 'other';
  const str = String(val).toLowerCase().trim();
  const match = EXPENSE_CATEGORIES.find((c) => c.id === str);
  if (match) return match.id;

  if (str.includes('fuel') || str.includes('diesel') || str.includes('generator') || str.includes('petrol')) return 'generator_fuel';
  if (str.includes('util') || str.includes('power') || str.includes('electr') || str.includes('water') || str.includes('nepa') || str.includes('phcn')) return 'utilities_power';
  if (str.includes('salary') || str.includes('payroll') || str.includes('wage') || str.includes('allowance') || str.includes('stipend')) return 'salary_payroll';
  if (str.includes('maint') || str.includes('repair') || str.includes('build') || str.includes('carpenter') || str.includes('plumb') || str.includes('paint')) return 'maintenance_repairs';
  if (str.includes('exam') || str.includes('print') || str.includes('stationer') || str.includes('paper') || str.includes('photocopy')) return 'exam_printing';
  if (str.includes('teach') || str.includes('class') || str.includes('book') || str.includes('chalk') || str.includes('marker') || str.includes('board')) return 'teaching_materials';
  if (str.includes('event') || str.includes('sport') || str.includes('excursion') || str.includes('inter-house') || str.includes('party') || str.includes('club')) return 'events_sports';
  if (str.includes('sec') || str.includes('sanit') || str.includes('clean') || str.includes('guard') || str.includes('waste') || str.includes('disinfect')) return 'security_sanitation';
  if (str.includes('tax') || str.includes('levy') || str.includes('permit') || str.includes('govt') || str.includes('ministry') || str.includes('board of internal')) return 'government_levy';
  if (str.includes('admin') || str.includes('office') || str.includes('internet') || str.includes('data') || str.includes('wifi') || str.includes('comm')) return 'administrative_supplies';

  return 'other';
}

/**
 * Safely parse any expense amount (handling numbers, strings with currency symbols or commas)
 */
export function parseExpenseAmount(val: any): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.-]+/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Normalize term strings for reliable matching (e.g. '1st Term', 'First Term', 'First Term (2026/2027)')
 */
export function normalizeExpenseTerm(term?: string): string {
  if (!term) return '';
  const s = term.toLowerCase().trim();
  if (s.includes('1st') || s.includes('first')) return 'first term';
  if (s.includes('2nd') || s.includes('second')) return 'second term';
  if (s.includes('3rd') || s.includes('third')) return 'third term';
  return s;
}

export function generateExpenseId(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EXP-${dateStr}-${rand}`;
}

export const INITIAL_SAMPLE_EXPENSES: ExpenseItem[] = [];

const LEGACY_MOCK_EXPENSE_IDS = new Set(['EXP-20260827']);

/**
 * Load expenses for a specific school from storage
 */
export function getStoredExpenses(schoolId: string = 'dominion-group'): ExpenseItem[] {
  try {
    const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((e) => !LEGACY_MOCK_EXPENSE_IDS.has(String(e?.id || '').trim()));
      }
    }
  } catch (e) {
    console.warn(`[Expense Storage Note] Failed loading expenses for '${schoolId}':`, e);
  }
  return [];
}

/**
 * Loads expenses directly from Cloud Firestore and syncs to local storage
 */
export async function syncExpensesFromFirestore(schoolId: string = 'dominion-group'): Promise<ExpenseItem[]> {
  try {
    const cloud = await loadExpensesFromFirestore(schoolId);
    if (Array.isArray(cloud)) {
      const clean = cloud.filter((e) => !LEGACY_MOCK_EXPENSE_IDS.has(String(e?.id || '').trim()));
      const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
      safeStorage.setItem(key, JSON.stringify(clean));
      return clean;
    }
  } catch (e) {
    console.warn(`[Expense Cloud Sync Note] Failed loading from Firestore for '${schoolId}':`, e);
  }
  return getStoredExpenses(schoolId);
}

/**
 * Save expenses for a specific school to storage
 */
export function saveStoredExpenses(expenses: ExpenseItem[], schoolId: string = 'dominion-group'): void {
  try {
    const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
    safeStorage.setItem(key, JSON.stringify(expenses));
  } catch (e) {
    console.warn(`[Expense Storage Note] Failed saving expenses for '${schoolId}':`, e);
  }
}

/**
 * Creates a new expense item data structure
 */
export function createExpenseItem(expense: Omit<ExpenseItem, 'id' | 'createdAt'>, schoolId: string = 'dominion-group'): ExpenseItem {
  return {
    ...expense,
    id: generateExpenseId(),
    categoryLabel: getExpenseCategoryLabel(expense.category),
    schoolId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Add a new expense item to local storage cache
 */
export function addExpenseItem(expense: Omit<ExpenseItem, 'id' | 'createdAt'>, schoolId: string = 'dominion-group'): ExpenseItem {
  const current = getStoredExpenses(schoolId);
  const newExpense = createExpenseItem(expense, schoolId);
  const updated = [newExpense, ...current];
  saveStoredExpenses(updated, schoolId);
  return newExpense;
}

/**
 * Delete an expense item from local storage cache
 */
export function deleteExpenseItem(expenseId: string, schoolId: string = 'dominion-group'): ExpenseItem[] {
  const current = getStoredExpenses(schoolId);
  const updated = current.filter((e) => e.id !== expenseId);
  saveStoredExpenses(updated, schoolId);
  return updated;
}

/**
 * Calculate combined Net School Financials:
 * Total Fees Inflow (School fee, admission, lesson, exam) MINUS (Payroll Disbursed + Operating Expenses)
 */
export function calculateNetFinancials(
  incomeTotals: {
    schoolFeeCollected: number;
    admissionFeeCollected: number;
    lessonFeeCollected: number;
    examFeeCollected: number;
    schoolFeeTotal: number;
    admissionFeeTotal: number;
    lessonFeeTotal: number;
    examFeeTotal: number;
  },
  payrollDisbursed: number,
  expenses: ExpenseItem[]
): OverallSchoolFinancials {
  const schoolFeeIncome = incomeTotals.schoolFeeCollected || 0;
  const admissionFeeIncome = incomeTotals.admissionFeeCollected || 0;
  const lessonFeeIncome = incomeTotals.lessonFeeCollected || 0;
  const examFeeIncome = incomeTotals.examFeeCollected || 0;
  const totalIncomeCollected = schoolFeeIncome + admissionFeeIncome + lessonFeeIncome + examFeeIncome;

  const totalIncomeExpected =
    (incomeTotals.schoolFeeTotal || 0) +
    (incomeTotals.admissionFeeTotal || 0) +
    (incomeTotals.lessonFeeTotal || 0) +
    (incomeTotals.examFeeTotal || 0);

  const totalIncomeOutstanding = Math.max(0, totalIncomeExpected - totalIncomeCollected);

  // Sum non-payroll operating expenses using parseExpenseAmount
  const otherExpensesTotal = expenses.reduce((acc, curr) => acc + parseExpenseAmount(curr?.amount), 0);

  const totalExpenses = (payrollDisbursed || 0) + otherExpensesTotal;
  const netOperatingSurplus = totalIncomeCollected - totalExpenses;
  const netMarginPercentage = totalIncomeCollected > 0
    ? Math.round((netOperatingSurplus / totalIncomeCollected) * 1000) / 10
    : 0;

  return {
    schoolFeeIncome,
    admissionFeeIncome,
    lessonFeeIncome,
    examFeeIncome,
    totalIncomeCollected,
    totalIncomeExpected,
    totalIncomeOutstanding,
    payrollDisbursed: payrollDisbursed || 0,
    otherExpensesTotal,
    totalExpenses,
    netOperatingSurplus,
    netMarginPercentage,
  };
}
