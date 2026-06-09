/**
 * File upload component for profile photos and documents
 */

"use client";

import { useState, useRef } from "react";
import { useUploadProfilePhoto, useUploadDocument } from "@/lib/hooks";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string, filePath: string) => void;
  onUploadError?: (error: Error) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  label?: string;
}

export function ProfilePhotoUpload({
  onUploadSuccess,
  onUploadError,
  maxSizeMB = 5,
  label = "Upload Profile Photo",
}: FileUploadProps) {
  const { execute, loading, error } = useUploadProfilePhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      const err = new Error(
        `File size exceeds ${maxSizeMB}MB limit`
      );
      onUploadError?.(err);
      return;
    }

    try {
      await execute(file);
      onUploadSuccess?.("", "");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      onUploadError?.(
        err instanceof Error ? err : new Error(String(err))
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={loading}
          className="flex-1"
        />
        <Button disabled={loading}>
          {loading ? "Uploading..." : "Upload"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
    </div>
  );
}

export function DocumentUpload({
  onUploadSuccess,
  onUploadError,
  maxSizeMB = 10,
  label = "Upload Document",
}: FileUploadProps & { documentType?: string }) {
  const [selectedType, setSelectedType] = useState<string>("license");
  const { execute, loading, error } = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentTypes = [
    { value: "license", label: "License" },
    { value: "certification", label: "Certification" },
    { value: "insurance", label: "Insurance" },
    { value: "consent_form", label: "Consent Form" },
    { value: "other", label: "Other" },
  ];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      const err = new Error(
        `File size exceeds ${maxSizeMB}MB limit`
      );
      onUploadError?.(err);
      return;
    }

    try {
      await execute({ file, documentType: selectedType });
      onUploadSuccess?.("", "");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      onUploadError?.(
        err instanceof Error ? err : new Error(String(err))
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          disabled={loading}
          className="px-3 py-2 border rounded"
        >
          {documentTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={loading}
          className="flex-1"
        />
        <Button disabled={loading}>
          {loading ? "Uploading..." : "Upload"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
    </div>
  );
}
