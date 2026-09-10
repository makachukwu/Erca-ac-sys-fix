/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord, PaymentReceipt } from '../types';
import { processStudentPayment, parseFinancialAmount } from './calculations';
import { getActiveSchool } from './schoolService';

export interface RecordPaymentResult {
  updatedRecord: StudentPaymentRecord;
  receipt: PaymentReceipt;
}

export interface PaymentFeeCategoryOptions {
  categoryType?: 'tuition' | 'lesson' | 'exam' | 'custom' | 'admission' | 'additional_fee';
  lessonMonth?: string;
  isPartPayment?: boolean;
  feeDescription?: string;
  receiptNumber?: string;
  additionalFeeId?: string;
}

/**
 * Records a student payment transaction and calculates updated balances and fee breakdowns.
 * Uses the canonical processStudentPayment engine to ensure 100% financial accuracy across
 * cards, modals, receipts, and dashboards.
 */
export function recordStudentPaymentLocally(
  student: StudentPaymentRecord,
  paymentAmount: number,
  paymentMethod: string = 'Cash',
  feeCategory?: PaymentFeeCategoryOptions
): RecordPaymentResult {
  let school;
  try {
    school = getActiveSchool();
  } catch {
    school = undefined;
  }

  const cleanAmount = parseFinancialAmount(paymentAmount, 0);
  return processStudentPayment(
    student,
    cleanAmount,
    paymentMethod,
    feeCategory,
    school
  );
}

export const recordStudentPayment = recordStudentPaymentLocally;


