/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { 
  Search, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Receipt, 
  X, 
  Sparkles,
  Calendar,
  Wallet,
  Printer,
  Share2,
  RotateCcw,
  ShieldCheck,
  BookOpen,
  FileCheck2,
  GraduationCap,
  Coins,
  Layers,
  Edit3
} from 'lucide-react';
import { StudentPaymentRecord, PaymentReceipt, AdditionalFeeItem } from '../types';
import { StatusBadge } from './StatusBadge';
import { getApplicableAdditionalFees } from '../services/schoolService';
import { 
  calculateBalance, 
  calculateStatus, 
  formatCurrency, 
  getTodayDateString,
  formatDate,
  deriveFeeBreakdown,
  getClassFeeSchedule,
  computeStudentLiveFees,
  ACADEMIC_MONTHS,
  FEE_SCHEDULE
} from '../services/calculations';
import { DGOSLogo } from './DGOSLogo';
import { getStoredBranding } from '../services/brandingService';

interface RecordPaymentViewProps {
  students: StudentPaymentRecord[];
  currencySymbol: string;
  preselectedStudent?: StudentPaymentRecord | null;
  onClearPreselectedStudent: () => void;
  onSubmitPayment: (
    student: StudentPaymentRecord,
    paymentAmount: number,
    paymentMethod: string,
    feeCategory?: {
      categoryType?: 'tuition' | 'admission' | 'lesson' | 'exam' | 'additional_fee' | 'custom';
      lessonMonth?: string;
      isPartPayment?: boolean;
      feeDescription?: string;
      receiptNumber?: string;
      additionalFeeId?: string;
    }
  ) => Promise<PaymentReceipt>;
  onViewStudentInList: (student: StudentPaymentRecord) => void;
  onOpenAddStudent: () => void;
  activeSchool?: import('../types').SchoolProfile;
  onOpenAdditionalFees?: () => void;
}

export const RecordPaymentView: React.FC<RecordPaymentViewProps> = ({
  students,
  currencySymbol,
  preselectedStudent,
  onClearPreselectedStudent,
  onSubmitPayment,
  onViewStudentInList,
  onOpenAddStudent,
  activeSchool,
  onOpenAdditionalFees,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentPaymentRecord | null>(
    preselectedStudent || null
  );
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [receiptError, setReceiptError] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash / Bank Transfer');

  type FeeKey = 'tuition' | 'admission' | 'exam' | 'lesson' | `additional_${string}`;
  const [selectedFees, setSelectedFees] = useState<Record<string, boolean>>({});
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({});
  const [lessonDuration, setLessonDuration] = useState<'1_month' | '2_months' | 'termly'>('termly');
  const [submitProgress, setSubmitProgress] = useState<{ label: string; status: 'pending' | 'success' | 'error' }[]>([]);

  const selectedLessonMonthFallback = new Date().toLocaleString('default', { month: 'long' });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<PaymentReceipt | null>(null);

  const prevPreselectedIdRef = React.useRef<string | undefined>(undefined);

  // Sync if preselectedStudent prop actually changes
  useEffect(() => {
    if (preselectedStudent && preselectedStudent.id !== prevPreselectedIdRef.current) {
      prevPreselectedIdRef.current = preselectedStudent.id;
      setSelectedStudent(preselectedStudent);
      setSearchQuery('');
      setCompletedReceipt(null);
      setErrorMessage(null);
      setReceiptError(false);
      setReceiptNumber('');
      setShowConfirmModal(false);
      setSelectedFees({});
      setFeeAmounts({});
      setLessonDuration('termly');
      setSubmitProgress([]);
    } else if (!preselectedStudent) {
      prevPreselectedIdRef.current = undefined;
    }
  }, [preselectedStudent?.id]);

  // Autocomplete matching students with deferred value for instant input typing
  const deferredSearch = useDeferredValue(searchQuery);
  const matchingStudents = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    if (!deferredSearch.trim()) return [];
    const q = deferredSearch.toLowerCase().trim();
    return students
      .filter(
        (s) =>
          (s?.full_name || '').toLowerCase().includes(q) ||
          (s?.id || '').toLowerCase().includes(q) ||
          (s?.class || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [students, deferredSearch]);

  // Live resolved calculations for selected student
  const liveStudentFees = useMemo(() => {
    return selectedStudent ? computeStudentLiveFees(selectedStudent, activeSchool) : null;
  }, [selectedStudent, activeSchool]);

  const selectedClassSchedule = useMemo(() => {
    return getClassFeeSchedule(activeSchool, selectedStudent?.class);
  }, [activeSchool, selectedStudent?.class]);

  const studentBreakdown = liveStudentFees?.breakdown || null;

  // Additional fees applicable to current student
  const availableAdditionalFees = useMemo(() => {
    if (!activeSchool) return [];
    return getApplicableAdditionalFees(activeSchool, selectedStudent?.class, selectedStudent?.term);
  }, [activeSchool, selectedStudent?.class, selectedStudent?.term]);

  // Build the checklist of payable fee lines for the selected student
  const feeLines = useMemo(() => {
    if (!selectedStudent || !studentBreakdown) return [];
    const lines: { key: FeeKey; label: string; fee: number; paid: number; due: number }[] = [
      {
        key: 'tuition',
        label: 'Tuition / School Fee',
        fee: studentBreakdown.tuitionFee,
        paid: studentBreakdown.tuitionPaid,
        due: Math.max(0, studentBreakdown.tuitionFee - studentBreakdown.tuitionPaid),
      },
      {
        key: 'admission',
        label: 'Admission Fee (New Student)',
        fee: studentBreakdown.admissionFee,
        paid: studentBreakdown.admissionPaid,
        due: Math.max(0, studentBreakdown.admissionFee - studentBreakdown.admissionPaid),
      },
      {
        key: 'exam',
        label: 'Exam Fee',
        fee: studentBreakdown.examFee,
        paid: studentBreakdown.examPaid,
        due: Math.max(0, studentBreakdown.examFee - studentBreakdown.examPaid),
      },
      {
        key: 'lesson',
        label: 'Lesson Fee',
        fee: studentBreakdown.lessonFee,
        paid: studentBreakdown.lessonPaid,
        due: Math.max(0, studentBreakdown.lessonFee - studentBreakdown.lessonPaid),
      },
    ];
    availableAdditionalFees.forEach((af) => {
      const record = studentBreakdown.additionalFees?.find((f) => f.feeId === af.id);
      const feeAmt = record?.amount ?? af.amount;
      const paidAmt = record?.amountPaid || 0;
      lines.push({
        key: `additional_${af.id}` as FeeKey,
        label: af.name,
        fee: feeAmt,
        paid: paidAmt,
        due: Math.max(0, feeAmt - paidAmt),
      });
    });
    return lines.filter((l) => l.fee > 0 || l.paid > 0);
  }, [selectedStudent, studentBreakdown, availableAdditionalFees]);

  const selectedFeeKeys = useMemo(
    () => feeLines.filter((l) => selectedFees[l.key]).map((l) => l.key),
    [feeLines, selectedFees]
  );

  const totalSelectedAmount = useMemo(
    () => selectedFeeKeys.reduce((sum, key) => sum + (Number(feeAmounts[key]) || 0), 0),
    [selectedFeeKeys, feeAmounts]
  );

  const tuitionLine = feeLines.find((l) => l.key === 'tuition');
  const tuitionAmount = Number(feeAmounts['tuition']) || 0;
  const tuitionRequiresReceipt =
    selectedFees['tuition'] && tuitionLine
      ? tuitionAmount >= tuitionLine.due || tuitionAmount >= tuitionLine.fee
      : false;

  const handleToggleFee = (line: { key: FeeKey; due: number }) => {
    setSelectedFees((prev) => {
      const next = { ...prev, [line.key]: !prev[line.key] };
      if (next[line.key] && !feeAmounts[line.key]) {
        setFeeAmounts((amts) => ({ ...amts, [line.key]: String(line.due) }));
      }
      return next;
    });
    setErrorMessage(null);
  };

  const handleFeeAmountChange = (key: string, value: string) => {
    setFeeAmounts((prev) => ({ ...prev, [key]: value }));
    setErrorMessage(null);
  };

  const handleLessonDurationChange = (opt: '1_month' | '2_months' | 'termly') => {
    setLessonDuration(opt);
    const monthly = selectedClassSchedule.lessonFeeMonthly;
    const termly = selectedClassSchedule.lessonFeeTermly;
    const amt = opt === '1_month' ? monthly : opt === '2_months' ? monthly * 2 : termly;
    setFeeAmounts((prev) => ({ ...prev, lesson: String(amt) }));
  };

  const handleSelectStudent = (student: StudentPaymentRecord) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setErrorMessage(null);
    setReceiptError(false);
    setReceiptNumber(student.receipt_no || '');
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
  };

  const handleClearStudent = () => {
    setSelectedStudent(null);
    setSearchQuery('');
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
    setReceiptNumber('');
    setReceiptError(false);
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  const handleOpenConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setReceiptError(false);

    if (!selectedStudent) {
      setErrorMessage('Please search and select a student first.');
      return;
    }

    if (selectedFeeKeys.length === 0) {
      setErrorMessage('Please select at least one fee to pay.');
      return;
    }

    const missingAmounts = selectedFeeKeys.filter((key) => !(Number(feeAmounts[key]) > 0));
    if (missingAmounts.length > 0) {
      const labels = missingAmounts
        .map((key) => feeLines.find((l) => l.key === key)?.label || key)
        .join(', ');
      setErrorMessage(`Please enter an amount for: ${labels}.`);
      return;
    }

    if (tuitionRequiresReceipt && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required when recording a full Tuition/School Fee payment.');
      const input = document.getElementById('payment-receipt-no-input');
      if (input) input.focus();
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmAndSubmit = async () => {
    if (!selectedStudent || selectedFeeKeys.length === 0) return;

    if (tuitionRequiresReceipt && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required for full Tuition/School Fee payments.');
      setShowConfirmModal(false);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const progressInit = selectedFeeKeys.map((key) => ({
      label: feeLines.find((l) => l.key === key)?.label || key,
      status: 'pending' as const,
    }));
    setSubmitProgress(progressInit);

    let lastReceipt: PaymentReceipt | null = null;
    const failures: string[] = [];
    let workingStudent: StudentPaymentRecord = selectedStudent;

    for (let i = 0; i < selectedFeeKeys.length; i++) {
      const key = selectedFeeKeys[i];
      const line = feeLines.find((l) => l.key === key)!;
      const amt = Number(feeAmounts[key]) || 0;

      const categoryType: 'tuition' | 'admission' | 'lesson' | 'exam' | 'additional_fee' | 'custom' =
        key === 'tuition' ? 'tuition'
        : key === 'admission' ? 'admission'
        : key === 'exam' ? 'exam'
        : key === 'lesson' ? 'lesson'
        : 'additional_fee';

      const additionalFeeId = key.startsWith('additional_') ? key.replace('additional_', '') : undefined;

      try {
        const receipt = await onSubmitPayment(
          workingStudent,
          amt,
          `${paymentMethod} (${line.label})`,
          {
            categoryType,
            lessonMonth: key === 'lesson'
              ? (lessonDuration === 'termly' ? 'Termly (Paid)' : lessonDuration === '2_months' ? '2 Months' : selectedLessonMonthFallback)
              : undefined,
            isPartPayment: amt < line.due,
            feeDescription: line.label,
            receiptNumber: key === 'tuition' ? (receiptNumber.trim() || undefined) : undefined,
            additionalFeeId,
          }
        );
        receipt.feeItemDescription = line.label;
        receipt.feeCategory = categoryType === 'tuition' ? 'school_fee' : (categoryType as any);
        lastReceipt = receipt;
        if (receipt.updatedStudent) {
          workingStudent = receipt.updatedStudent;
        }
        setSubmitProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: 'success' } : p)));
      } catch (err: any) {
        failures.push(line.label);
        setSubmitProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: 'error' } : p)));
      }
    }

    setIsSubmitting(false);

    if (failures.length > 0) {
      setErrorMessage(
        `${failures.length} of ${selectedFeeKeys.length} payment(s) failed to save: ${failures.join(', ')}. Successful payments were saved — please retry the failed ones.`
      );
      setShowConfirmModal(false);
      return;
    }

    if (lastReceipt) {
      setCompletedReceipt(lastReceipt);
    }
    setShowConfirmModal(false);
  };

  const handleResetForNextPayment = () => {
    setCompletedReceipt(null);
    setSelectedStudent(null);
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
    setReceiptNumber('');
    setReceiptError(false);
    setSearchQuery('');
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  const handlePrintReceipt = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print action blocked or not supported in iframe context:', e);
    }
  };

  return (
    <div className="flex-1 pb-28 px-5 pt-4 space-y-4">
      {/* State A: Completed Payment Receipt Screen */}
      {completedReceipt ? (
        <div className="space-y-4">
          <div className="bg-[#dcfce7] border border-[#bbf7d0] rounded-3xl p-5 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#166534] text-white flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-[#166534] uppercase tracking-tight">Payment Recorded Successfully</h3>
            <p className="text-xs text-[#166534]/90 font-medium">
              Updated Google Sheet with recalculated balance and status.
            </p>
          </div>

            {/* Printable Digital Receipt Card */}
          <div
            id="printable-receipt"
            className="bg-white rounded-3xl p-6 border border-[#f0f0f0] shadow-sm space-y-4 font-sans relative overflow-hidden"
          >
            <div className="flex justify-between items-start border-b border-[#f0f0f0] pb-3">
              <div className="flex items-start gap-3">
                <DGOSLogo size="sm" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase font-black text-[#2563eb] tracking-wider">Official Payment Receipt</p>
                    <span className="text-[10px] text-slate-500 font-bold truncate max-w-[200px]">
                      • {activeSchool?.name || getStoredBranding(activeSchool?.id).appName}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-[#1a1a1a]">{completedReceipt.studentName}</h4>
                  <p className="text-xs text-[#a0a0a0] font-mono">
                    #{completedReceipt.studentId} • {completedReceipt.studentClass}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono font-bold text-[#1a1a1a]">{completedReceipt.receiptNumber || 'Official Record'}</p>
                <p className="text-[11px] text-[#a0a0a0]">{completedReceipt.paymentDate}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Term / Session:</span>
                <span className="font-bold text-[#1a1a1a]">
                  {completedReceipt.term} {completedReceipt.session && `(${completedReceipt.session})`}
                </span>
              </div>
              {completedReceipt.feeItemDescription && (
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#666]">Payment Purpose:</span>
                  <span className="font-bold text-[#2563eb]">{completedReceipt.feeItemDescription}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Payment Channel:</span>
                <span className="font-bold text-[#1a1a1a]">{completedReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">
                  {completedReceipt.feeCategory === 'lesson' 
                    ? 'Lesson Fee Payable:' 
                    : completedReceipt.feeCategory === 'exam' 
                    ? 'Exam Fee Payable:' 
                    : completedReceipt.feeCategory === 'additional_fee'
                    ? `${completedReceipt.feeItemDescription || 'Fee'} Payable:`
                    : 'School Fee Payable:'}
                </span>
                <span className="font-bold text-[#1a1a1a]">
                  {formatCurrency(completedReceipt.totalFee, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f0f0f0] bg-[#f4f4f7] px-3 rounded-2xl">
                <span className="font-bold text-[#1a1a1a]">Amount Paid Now:</span>
                <span className="font-black text-[#2563eb] text-sm">
                  {formatCurrency(completedReceipt.amountPaidNow, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Total Cumulative Paid:</span>
                <span className="font-bold text-[#1a1a1a]">
                  {formatCurrency(completedReceipt.totalPaid, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Remaining Balance:</span>
                <span
                  className={`font-bold ${
                    completedReceipt.remainingBalance > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'
                  }`}
                >
                  {formatCurrency(completedReceipt.remainingBalance, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 items-center">
                <span className="text-[#666]">Current Status:</span>
                <StatusBadge status={completedReceipt.status} size="sm" />
              </div>
            </div>

            <div className="pt-2 text-[10px] text-center text-[#a0a0a0] border-t border-[#f0f0f0] space-y-0.5">
              <p>{getStoredBranding(activeSchool?.id).receiptFooterText || 'Official payment record • Verified Bursary Access'}</p>
              <p className="text-[9px] text-slate-400 font-mono">Verified Bursary Access • {getTodayDateString()}</p>
            </div>
          </div>

          {/* Action Buttons for Receipt */}
          <div className="space-y-2 no-print">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrintReceipt}
                id="print-receipt-btn"
                className="py-3 px-4 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all border border-[#eee]"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>

              <button
                onClick={handleResetForNextPayment}
                id="record-another-payment-btn"
                className="py-3 px-4 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>Record Next</span>
              </button>
            </div>

            {selectedStudent && (
              <button
                type="button"
                onClick={() => onViewStudentInList(selectedStudent)}
                className="w-full py-2.5 px-4 rounded-2xl bg-white border border-[#ddd] text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-all shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Edit Student Fees (Exam, Lesson, Tuition)</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* State B: Payment Recording Form */
        <form onSubmit={handleOpenConfirmation} className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 1: Select Student</h2>
              <span className="text-[10px] font-bold text-[#a0a0a0] uppercase">Required</span>
            </div>

            {/* If Student Selected */}
            {selectedStudent ? (
              <div className="bg-[#f4f4f7] rounded-2xl p-4 border border-[#eee] space-y-2 relative">
                <button
                  type="button"
                  onClick={handleClearStudent}
                  id="change-selected-student-btn"
                  className="absolute right-3 top-3 text-xs text-[#1a1a1a] hover:bg-slate-200 bg-white border border-[#eee] px-2.5 py-1 rounded-full font-bold shadow-2xs"
                >
                  Change
                </button>
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#a0a0a0] uppercase">
                    #{selectedStudent.id}
                  </span>
                  <h3 className="text-base font-bold text-[#1a1a1a] pr-16">{selectedStudent.full_name}</h3>
                  <p className="text-xs text-[#666] mt-0.5">
                    {selectedStudent.class || 'No Class'} • {selectedStudent.term || 'No Term'}
                  </p>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2.5 border-t border-[#eee] text-xs">
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Fee</span>
                    <p className="font-bold text-[#1a1a1a]">
                      {formatCurrency(liveStudentFees?.totalFee ?? selectedStudent.fee_amount, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Paid</span>
                    <p className="font-bold text-[#10b981]">
                      {formatCurrency(liveStudentFees?.amountPaid ?? selectedStudent.amount_paid, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Balance</span>
                    <p
                      className={`font-bold ${
                        (liveStudentFees?.balance ?? selectedStudent.balance) > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'
                      }`}
                    >
                      {formatCurrency(liveStudentFees?.balance ?? selectedStudent.balance, currencySymbol)}
                    </p>
                  </div>
                </div>

                {/* Shortcut to view/edit student fee details */}
                <div className="pt-2 border-t border-[#eee] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onViewStudentInList(selectedStudent)}
                    className="text-[11px] font-bold text-[#2563eb] hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Fees (Exam, Lesson, Tuition)</span>
                  </button>
                  <span className="text-[10px] text-[#a0a0a0]">
                    Editable after payment
                  </span>
                </div>
              </div>
            ) : (
              /* Student Search Box */
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    id="payment-search-student-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search student..."
                    className="w-full bg-[#f4f4f7] border-none rounded-2xl py-3 pl-11 pr-9 text-sm text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-[#a0a0a0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      id="clear-payment-search-btn"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-[#1a1a1a] p-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {matchingStudents.length > 0 && (
                  <div className="bg-white border border-[#f0f0f0] rounded-2xl shadow-lg divide-y divide-[#f0f0f0] overflow-hidden">
                    {matchingStudents.map((stu) => (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => handleSelectStudent(stu)}
                        id={`select-stu-${stu.id}`}
                        className="w-full p-3 text-left hover:bg-[#f4f4f7] flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1a1a1a] truncate">{stu.full_name}</p>
                          <p className="text-[10px] text-[#a0a0a0] font-mono">
                            #{stu.id} • {stu.class} • Balance: {formatCurrency(stu.balance, currencySymbol)}
                          </p>
                        </div>
                        <StatusBadge status={stu.status} size="sm" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.trim() && matchingStudents.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl border border-[#eee]">
                    No students match &quot;{searchQuery}&quot;.{' '}
                    <button
                      type="button"
                      onClick={onOpenAddStudent}
                      className="text-[#2563eb] font-bold underline"
                    >
                      Enroll as new student?
                    </button>
                  </div>
                )}

                {!searchQuery && students.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl">
                    No student records found in Google Sheet. Enroll students first.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Select Fees & Enter Amounts (Enabled when student selected) */}
          <div
            className={`bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-4 transition-opacity ${
              !selectedStudent ? 'opacity-40 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 2: Select Fees to Pay</h2>
              <span className="text-[10px] font-bold text-[#2563eb] uppercase">Step 2 of 2</span>
            </div>

            {selectedStudent && studentBreakdown && (
              <div className="space-y-2.5">
                {feeLines.map((line) => (
                  <div
                    key={line.key}
                    className={`rounded-2xl border transition-all ${
                      selectedFees[line.key]
                        ? 'border-[#2563eb] bg-blue-50/50'
                        : 'border-[#eee] bg-[#f9f9fb]'
                    }`}
                  >
                    <label className="flex items-center gap-3 p-3.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedFees[line.key]}
                        onChange={() => handleToggleFee(line)}
                        disabled={line.due <= 0}
                        className="w-5 h-5 rounded-md border-slate-300 text-[#2563eb] focus:ring-[#2563eb] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-[#1a1a1a] truncate">{line.label}</span>
                          <span className={`text-[11px] font-bold shrink-0 ${line.due > 0 ? 'text-[#666]' : 'text-emerald-600'}`}>
                            {line.due > 0 ? `Due: ${formatCurrency(line.due, currencySymbol)}` : 'Fully Paid'}
                          </span>
                        </div>
                      </div>
                    </label>

                    {selectedFees[line.key] && (
                      <div className="px-3.5 pb-3.5 space-y-2 animate-in fade-in duration-150">
                        {line.key === 'lesson' && (
                          <div className="flex gap-1.5">
                            {(['1_month', '2_months', 'termly'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleLessonDurationChange(opt)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                  lessonDuration === opt
                                    ? 'bg-[#2563eb] text-white border-[#2563eb]'
                                    : 'bg-white text-[#1a1a1a] border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {opt === '1_month' ? '1 Month' : opt === '2_months' ? '2 Months' : 'Full Term'}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                              {currencySymbol}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={feeAmounts[line.key] ?? ''}
                              onChange={(e) => handleFeeAmountChange(line.key, e.target.value)}
                              placeholder="0"
                              className="w-full pl-7 pr-3 py-2 text-xs font-black bg-white border border-slate-200 rounded-xl text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                            />
                          </div>
                          {Number(feeAmounts[line.key] || 0) > 0 && Number(feeAmounts[line.key] || 0) < line.due && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg shrink-0">
                              Part Payment
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Receipt Number (required only if Tuition is checked and paid in full) */}
            {selectedStudent && (
              <div>
                <label className="text-[11px] font-bold text-[#1a1a1a] uppercase block mb-1">
                  Receipt No. {tuitionRequiresReceipt && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  id="payment-receipt-no-input"
                  value={receiptNumber}
                  onChange={(e) => {
                    setReceiptNumber(e.target.value);
                    setReceiptError(false);
                  }}
                  placeholder="e.g. 004821"
                  className={`w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-[#f4f4f7] rounded-xl border focus:ring-2 focus:outline-none transition-all ${
                    receiptError ? 'border-rose-400 ring-2 ring-rose-100' : 'border-[#eee] focus:ring-[#2563eb]'
                  }`}
                />
              </div>
            )}

            {/* Payment Method */}
            {selectedStudent && (
              <div>
                <label className="text-[11px] font-bold text-[#1a1a1a] uppercase block mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                >
                  <option>Cash / Bank Transfer</option>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>POS</option>
                </select>
              </div>
            )}

            {/* Selected Total Summary */}
            {selectedFeeKeys.length > 0 && (
              <div className="p-4 bg-[#2563eb] rounded-2xl text-white space-y-1.5 shadow-md shadow-blue-500/10">
                <div className="flex justify-between items-center text-white/80 text-[10px] font-bold uppercase tracking-wider">
                  <span>{selectedFeeKeys.length} Fee{selectedFeeKeys.length > 1 ? 's' : ''} Selected</span>
                  <span>Date: {getTodayDateString()}</span>
                </div>
                <p className="text-2xl font-black text-white">
                  {formatCurrency(totalSelectedAmount, currencySymbol)}
                </p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Trigger Confirmation Prompt */}
          <button
            type="submit"
            disabled={!selectedStudent || selectedFeeKeys.length === 0 || isSubmitting}
            id="proceed-to-payment-confirm-btn"
            className="w-full py-4 px-4 rounded-2xl bg-[#2563eb] text-white font-black text-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <CreditCard className="w-4 h-4" />
            <span>Review & Record Payment</span>
          </button>
        </form>
      )}

      {/* Confirmation Prompt Modal */}
      {showConfirmModal && selectedStudent && (
        <div 
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-3xl max-h-[90dvh] sm:max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">Confirm Payment</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">Verify before writing to ledger</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-black">
                  {formatCurrency(totalSelectedAmount, currencySymbol)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  id="close-confirm-modal-btn"
                  className="w-8 h-8 rounded-full bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center border border-slate-200 shadow-2xs"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable with compact, clean mobile layout) */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 flex-1 min-h-0">
              {/* Highlight Amount Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 block text-center">
                  Total Payment to Collect
                </span>
                <p className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight text-center">
                  {formatCurrency(totalSelectedAmount, currencySymbol)}
                </p>
                <div className="space-y-1 pt-1">
                  {selectedFeeKeys.map((key) => {
                    const line = feeLines.find((l) => l.key === key);
                    const progressItem = submitProgress.find((p) => p.label === line?.label);
                    return (
                      <div key={key} className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-2.5 py-1.5">
                        <span className="font-bold text-blue-900 flex items-center gap-1.5">
                          {progressItem?.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {progressItem?.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                          {line?.label}
                        </span>
                        <span className="font-mono font-black text-blue-800">
                          {formatCurrency(Number(feeAmounts[key]) || 0, currencySymbol)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Summary */}
              <div className="bg-slate-50 rounded-2xl p-3 sm:p-4 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Student Name:</span>
                  <span className="font-bold text-slate-900 text-sm truncate max-w-[180px] sm:max-w-none">{selectedStudent.full_name}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Student ID / Class:</span>
                  <span className="font-bold text-slate-800">
                    #{selectedStudent.id} • {selectedStudent.class}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Term / Session:</span>
                  <span className="font-bold text-slate-800">
                    {selectedStudent.term} ({selectedStudent.session})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Channel:</span>
                  <span className="font-bold text-slate-800">{paymentMethod}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-500 font-medium">Receipt Number:</span>
                  <span className={`font-mono font-bold text-xs ${receiptNumber.trim() ? 'text-blue-600' : 'text-slate-400'}`}>
                    {receiptNumber.trim() || 'Auto-generated on submit'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions (Fixed/Sticky Footer docked with safe bottom padding) */}
            <div className="shrink-0 p-3.5 sm:p-4 bg-white border-t border-slate-100 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex gap-2.5 z-10 pb-6 sm:pb-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                id="cancel-payment-confirm-btn"
                className="flex-1 py-3.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold border border-slate-200 active:scale-95 transition-all flex items-center justify-center"
              >
                Modify / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSubmit}
                disabled={isSubmitting}
                id="final-confirm-payment-btn"
                className="flex-[1.5] py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black disabled:opacity-50 shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {isSubmitting ? (
                  <span>Recording Payment...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
