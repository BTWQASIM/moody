"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { auth } from "@/lib/firebase"
import { signInAnonymously } from "firebase/auth"

export default function FirebaseDebugPage() {
  const [debug, setDebug] = useState<any>({})
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    // Check environment variables
    const envVars = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "✓ Set" : "✗ Missing",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? "✓ Set" : "✗ Missing",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? "✓ Set" : "✗ Missing",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? "✓ Set" : "✗ Missing",
    }

    // Check Firebase initialization
    let firebaseStatus = "Not checked"
    try {
      if (auth) {
        firebaseStatus = "✓ Firebase auth module loaded"
      } else {
        firebaseStatus = "✗ Firebase auth module not loaded"
      }
    } catch (e: any) {
      firebaseStatus = `✗ Error: ${e.message}`
    }

    setDebug({
      envVars,
      firebaseStatus,
      timestamp: new Date().toLocaleString(),
    })
  }, [])

  const testFirebaseAuth = async () => {
    setTesting(true)
    try {
      // Try to sign in anonymously to test Firebase connection
      const result = await signInAnonymously(auth)
      setDebug((prev: any) => ({
        ...prev,
        authTest: "✓ Firebase Auth working",
        authData: {
          uid: result.user.uid.substring(0, 20) + "...",
          isAnonymous: result.user.isAnonymous,
        },
      }))
    } catch (e: any) {
      setDebug((prev: any) => ({
        ...prev,
        authTest: `✗ Auth error: ${e.code}`,
        authError: {
          code: e.code,
          message: e.message,
        },
      }))
    }
    setTesting(false)
  }

  const testBackend = async () => {
    setTesting(true)
    try {
      const response = await fetch(`http://localhost:8000/health`)
      const data = await response.json()
      setDebug((prev: any) => ({
        ...prev,
        backendTest: "✓ Backend responds",
        backendData: data,
      }))
    } catch (e: any) {
      setDebug((prev: any) => ({
        ...prev,
        backendTest: `✗ Backend error: ${e.message}`,
      }))
    }
    setTesting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              Firebase Configuration Debug
            </CardTitle>
            <CardDescription>Check your Firebase setup status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Environment Variables */}
            <div>
              <h3 className="font-semibold mb-3">✅ Environment Variables</h3>
              <div className="space-y-2 bg-gray-50 p-4 rounded">
                {Object.entries(debug.envVars || {}).map(([key, value]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{key}:</span>
                    <span className={value.includes("✓") ? "text-green-600 font-bold" : "text-red-600"}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Firebase Status */}
            <div>
              <h3 className="font-semibold mb-3">✅ Firebase Status</h3>
              <div className="bg-gray-50 p-4 rounded">
                <div className={debug.firebaseStatus?.includes("✓") ? "text-green-600 font-bold" : "text-red-600"}>
                  {debug.firebaseStatus || "Checking..."}
                </div>
              </div>
            </div>

            {/* Firebase Auth Test - CRITICAL */}
            <div className="border-2 border-blue-300 p-4 rounded-lg bg-blue-50">
              <h3 className="font-semibold mb-3 text-blue-900">🔍 Firebase Auth Test (CRITICAL)</h3>
              <p className="text-sm text-blue-800 mb-3">
                Run this test to see if Firebase authentication is properly configured. This will reveal the exact error.
              </p>
              <Button onClick={testFirebaseAuth} disabled={testing} className="w-full mb-3 bg-blue-600 hover:bg-blue-700">
                {testing ? "Testing..." : "Test Firebase Authentication"}
              </Button>
              {debug.authTest && (
                <div className="bg-white p-4 rounded border border-blue-200">
                  <div className={`font-bold ${debug.authTest.includes("✓") ? "text-green-600" : "text-red-600"}`}>
                    {debug.authTest}
                  </div>
                  {debug.authError && (
                    <div className="mt-3 bg-red-50 p-3 rounded text-sm">
                      <div className="text-red-900">
                        <strong>Error Code:</strong> <code className="bg-red-100 px-2 py-1 rounded">{debug.authError.code}</code>
                      </div>
                      <div className="text-red-800 mt-2">
                        <strong>Message:</strong> {debug.authError.message}
                      </div>
                    </div>
                  )}
                  {debug.authData && (
                    <div className="mt-3 bg-green-50 p-3 rounded text-sm text-green-900">
                      <strong>User Created:</strong> {debug.authData.uid}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Backend Test */}
            <div>
              <h3 className="font-semibold mb-3">✅ Backend Connectivity</h3>
              <Button onClick={testBackend} disabled={testing} className="w-full mb-3">
                {testing ? "Testing..." : "Test Backend Connection"}
              </Button>
              {debug.backendTest && (
                <div className="bg-gray-50 p-4 rounded">
                  <div className={debug.backendTest.includes("✓") ? "text-green-600 font-bold" : "text-red-600"}>
                    {debug.backendTest}
                  </div>
                  {debug.backendData && (
                    <pre className="mt-2 text-xs overflow-auto bg-gray-100 p-2 rounded">
                      {JSON.stringify(debug.backendData, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Critical Troubleshooting */}
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-900 text-sm">
                <strong>If Firebase Auth Test shows an error:</strong>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                  <li><strong>auth/configuration-not-found:</strong> Check Firebase Console project ID matches exactly</li>
                  <li><strong>auth/operation-not-allowed:</strong> Go to Firebase Console → Authentication → Sign-in method → Enable Email/Password</li>
                  <li><strong>auth/invalid-api-key:</strong> Check your NEXT_PUBLIC_FIREBASE_API_KEY is correct</li>
                  <li><strong>Network errors:</strong> Make sure Firebase services are accessible from your network</li>
                  <li>Copy the exact error code and search Firebase documentation for solutions</li>
                  <li>Clear browser cache (Ctrl+Shift+Delete) and hard refresh (Ctrl+F5)</li>
                </ol>
              </AlertDescription>
            </Alert>

            {/* Configuration Values */}
            <div>
              <h3 className="font-semibold mb-3 text-sm">Raw Configuration Values</h3>
              <div className="bg-gray-800 text-gray-100 p-4 rounded font-mono text-xs overflow-auto max-h-48 space-y-1">
                <div>API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 20)}...</div>
                <div>Auth Domain: {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}</div>
                <div>Project ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</div>
                <div>Storage Bucket: {process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}</div>
                <div>App ID: {process.env.NEXT_PUBLIC_FIREBASE_APP_ID}</div>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-xs text-gray-500">
              Last checked: {debug.timestamp}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <a
            href="https://console.firebase.google.com/project/pingmytherapist"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-white rounded shadow hover:shadow-md text-center"
          >
            <div className="font-semibold text-sm">Firebase Console</div>
            <div className="text-xs text-gray-500 mt-1">pingmytherapist</div>
          </a>
          <a
            href="http://localhost:3000/login"
            className="p-4 bg-white rounded shadow hover:shadow-md text-center"
          >
            <div className="font-semibold text-sm">Try Login</div>
            <div className="text-xs text-gray-500 mt-1">Test credentials</div>
          </a>
        </div>
      </div>
    </div>
  )
}
