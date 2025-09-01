"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { toast } from "sonner";

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "bip39";
import { derivePath } from "ed25519-hd-key";
import bs58 from "bs58";
import nacl from "tweetnacl";

export default function Home() {
  const [page, setPage] = useState(1);
  const [mnemonic, setMnemonic] = useState(null);
  const [copyText, setCopyText] = useState("Copy");
  const [wallets, setWallets] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [importError, setImportError] = useState("");
  
  // Multi-account management
  const [accounts, setAccounts] = useState([]);
  const [currentAccountId, setCurrentAccountId] = useState(null);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState('ethereum');

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedAccounts = localStorage.getItem('hdWalletAccounts');
    const savedCurrentId = localStorage.getItem('currentAccountId');
    
    if (savedAccounts) {
      const parsedAccounts = JSON.parse(savedAccounts);
      setAccounts(parsedAccounts);
      
      if (savedCurrentId && parsedAccounts.find(acc => acc.id === savedCurrentId)) {
        const currentAccount = parsedAccounts.find(acc => acc.id === savedCurrentId);
        setCurrentAccountId(savedCurrentId);
        setMnemonic(currentAccount.mnemonic);
        setWallets(currentAccount.wallets);
        setPage(4);
      } else if (parsedAccounts.length > 0) {
        // Set first account as current if no valid current ID
        const firstAccount = parsedAccounts[0];
        setCurrentAccountId(firstAccount.id);
        setMnemonic(firstAccount.mnemonic);
        setWallets(firstAccount.wallets);
        setPage(4);
      }
    }
  }, []);

  // Save data to localStorage whenever accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      localStorage.setItem('hdWalletAccounts', JSON.stringify(accounts));
    }
  }, [accounts]);

  // Save current account ID
  useEffect(() => {
    if (currentAccountId) {
      localStorage.setItem('currentAccountId', currentAccountId);
    }
  }, [currentAccountId]);

  // Save current account data when mnemonic or wallets change
  useEffect(() => {
    if (currentAccountId && mnemonic) {
      setAccounts(prev => prev.map(account => 
        account.id === currentAccountId 
          ? { ...account, mnemonic, wallets }
          : account
      ));
    }
  }, [mnemonic, wallets, currentAccountId]);

  // Create new account
  const createNewAccount = (mnemonicPhrase, accountName = null) => {
    const accountId = Date.now().toString();
    const newAccount = {
      id: accountId,
      name: accountName || `Account ${accounts.length + 1}`,
      mnemonic: mnemonicPhrase,
      wallets: [],
      createdAt: new Date().toISOString()
    };
    
    setAccounts(prev => [...prev, newAccount]);
    setCurrentAccountId(accountId);
    setMnemonic(mnemonicPhrase);
    setWallets([]);
  };

  // Switch between accounts
  const switchToAccount = (accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (account) {
      setCurrentAccountId(accountId);
      setMnemonic(account.mnemonic);
      setWallets(account.wallets);
      setShowAccountSelector(false);
      setPage(4);
    }
  };

  // Delete account
  const deleteAccount = (accountId) => {
    if (accounts.length === 1) {
      toast.error("Cannot delete the last account");
      return;
    }
    
    const updatedAccounts = accounts.filter(acc => acc.id !== accountId);
    setAccounts(updatedAccounts);
    
    if (currentAccountId === accountId) {
      // Switch to first available account
      const firstAccount = updatedAccounts[0];
      setCurrentAccountId(firstAccount.id);
      setMnemonic(firstAccount.mnemonic);
      setWallets(firstAccount.wallets);
    }
    
    toast.success("Account deleted successfully");
  };
  

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);

    setCopyText("Copied!");
    toast.success("Copied to clipboard!");

    setTimeout(() => {
      setCopyText("Copy");
    }, 2000);
  }

  // Validate mnemonic phrase
  // const validateMnemonic = (phrase) => {
  //   const words = phrase.trim().split(/\s+/);
  //   if (words.length !== 12) {
  //     return "Seed phrase must be exactly 12 words";
  //   }
    
  //   // Try to create a wallet from the mnemonic to validate it
  //   try {
  //     ethers.HDNodeWallet.fromPhrase(phrase);
  //     return null; // Valid
  //   } catch (error) {
  //     return "Invalid seed phrase. Please check your words and try again.";
  //   }
  // };

  // Handle import wallet
  const handleImportWallet = () => {
    const trimmedPhrase = importPhrase.trim();
    const words = trimmedPhrase.split(/\s+/);
    
    // Validate word count
    if (words.length !== 12) {
      const error = "Seed phrase must be exactly 12 words";
      setImportError(error);
      toast.error(error);
      return;
    }
    
    // Validate using bip39
    if (!validateMnemonic(trimmedPhrase)) {
      const error = "Invalid seed phrase. Please check your words and try again.";
      setImportError(error);
      toast.error(error);
      return;
    }

    try {
      // Check if this mnemonic already exists
      const existingAccount = accounts.find(acc => acc.mnemonic === trimmedPhrase);
      if (existingAccount) {
        toast.error("This wallet already exists in your accounts");
        return;
      }
      
      createNewAccount(trimmedPhrase, `Imported Account ${accounts.length + 1}`);
      setShowImportModal(false);
      setImportPhrase("");
      setImportError("");
      toast.success("Wallet imported successfully!");
      setPage(3);
    } catch (error) {
      setImportError("Failed to import wallet. Please check your seed phrase.");
      toast.error("Failed to import wallet");
    }
  };

  // Reset import modal state
  const resetImportModal = () => {
    setShowImportModal(false);
    setImportPhrase("");
    setImportError("");
  };

  // Generate mnemonic only once (using bip39.generateMnemonic)
  const handleCreateMnemonic = () => {
    if (!mnemonic) {
      const mnemonicPhrase = generateMnemonic(128);
      createNewAccount(mnemonicPhrase);
    }
    setPage(3);
  };

  // Create a new wallet from mnemonic
  const handleCreateNewWallet = () => {
    if (!mnemonic) return;
    
    // Use next index for HD wallet derivation
    const index = wallets.length;
    const newWallet = handleWalletCreation(selectedWalletType, mnemonic, index);
    
    if (newWallet) {
      setWallets([...wallets, newWallet]);
      setPage(4);
    }
  };

  const handleWalletCreation = (pathType, mnemonicPhrase, index) => {
    try {
      if (!mnemonicPhrase || !validateMnemonic(mnemonicPhrase)) {
        toast.error("Invalid mnemonic phrase");
        return null;
      }

      const seed = mnemonicToSeedSync(mnemonicPhrase);
      let path;
      let derivedKey, address, privateKey, publicKey;

      if (pathType === 'solana') {
        path = `m/44'/501'/0'/${index}'`;
        const { key: derivedKey } = derivePath(path, seed.toString('hex'));
        const keyPair = nacl.sign.keyPair.fromSeed(derivedKey);
        publicKey = keyPair.publicKey;
        privateKey = keyPair.secretKey;
        address = bs58.encode(publicKey);
        return { address, path, privateKey: bs58.encode(privateKey), type: 'solana' };
      }

      if (pathType === 'ethereum') {
        path = `m/44'/60'/0'/0/${index}`;
        // Use ethers for Ethereum wallet creation
        const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonicPhrase);
        const wallet = hdNode.derivePath(`0/${index}`);
        return { address: wallet.address, path, privateKey: wallet.privateKey, type: 'ethereum' };
      }

    } catch (error) {
      console.error("Error deriving wallet:", error);
      toast.error("Failed to derive wallet");
      return null;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Progress Bar */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">Step {page} of 4</div>
            <div className="text-sm text-gray-500">HD Wallet Setup</div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(page / 4) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Content Area */}
        <div className="max-w-3xl mx-auto">
          {accounts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {accounts.find(acc => acc.id === currentAccountId)?.name || 'Current Account'}
                  </div>
                  <div className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''} total</div>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowAccountSelector(true)}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Switch Account
                </button>
                <button
                  onClick={() => setPage(2)}
                  className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  + New Account
                </button>
              </div>
            </div>
          )}
          {page === 1 && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">basic wallet</h1>
              <p className="text-xl text-gray-600 mb-8">basic wallet operations</p>
              <button
                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-lg"
                onClick={() => setPage(2)}
              >
                Get Started →
              </button>
            </div>
          )}

          {page === 2 && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Create Your Seed Phrase</h2>
                <p className="text-gray-600">We'll generate a secure 12-word recovery phrase for your wallet</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-yellow-600 mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-yellow-800 mb-2">Important Security Notice</h3>
                    <p className="text-yellow-700 text-sm">Your seed phrase is the master key to your wallet. Store it securely and never share it with anyone. We cannot recover it if lost.</p>
                  </div>
                </div>
              </div>
              <div className="text-center flex gap-4 justify-center items-center">
                <button
                  className="bg-green-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-green-700 transition-colors text-lg"
                  onClick={handleCreateMnemonic}
                >
                  Generate Seed Phrase
                </button>
                <button
                  className="text-black border-2 border-green-600 px-8 py-4 rounded-xl font-semibold hover:bg-green-50 transition-colors text-lg"
                  onClick={() => setShowImportModal(true)}
                >
                  Import Existing Wallet
                </button>
              </div>
            </div>
          )}

          {page === 3 && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Recovery Phrase</h2>
                <p className="text-gray-600">Write down these 12 words in the exact order shown</p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-6 mb-8">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {mnemonic?.split(' ').map((word, index) => (
                    <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">{index + 1}</div>
                      <div className="font-mono font-semibold text-gray-900">{word}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center">
                  <button 
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    onClick={() => copyToClipboard(mnemonic)}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copyText}
                  </button>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
                <h3 className="font-semibold text-red-800 mb-2">⚠️ Security Checklist</h3>
                <div className="space-y-2 text-red-700 text-sm">
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" />
                    I have written down my seed phrase on paper
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" />
                    I understand this phrase can recover my wallet
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-2" />
                    I will keep this phrase private and secure
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                  onClick={() => setPage(2)}
                >
                  ← Back
                </button>
                <button
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
                  onClick={handleCreateNewWallet}
                >
                  Create First Wallet →
                </button>
              </div>
            </div>
          )}

          {page === 4 && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Wallets</h2>
                <p className="text-gray-600">All wallets derived from your seed phrase</p>
              </div>

              {/* Wallet Type Selector */}
              <div className="bg-blue-50 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-blue-900 mb-4">Create New Wallet</h3>
                <div className="flex gap-4 mb-4">
                  <button
                    onClick={() => setSelectedWalletType('ethereum')}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      selectedWalletType === 'ethereum'
                        ? 'border-blue-500 bg-blue-100 text-blue-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">Ξ</span>
                      </div>
                    </div>
                    <div className="font-semibold">Ethereum</div>
                    <div className="text-sm opacity-75">EVM Compatible</div>
                  </button>
                  <button
                    onClick={() => setSelectedWalletType('solana')}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      selectedWalletType === 'solana'
                        ? 'border-purple-500 bg-purple-100 text-purple-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-2">
                      <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">◎</span>
                      </div>
                    </div>
                    <div className="font-semibold">Solana</div>
                    <div className="text-sm opacity-75">High Performance</div>
                  </button>
                </div>
                <button
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                  onClick={handleCreateNewWallet}
                >
                  + Create {selectedWalletType === 'ethereum' ? 'Ethereum' : 'Solana'} Wallet
                </button>
              </div>

              {wallets.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-gray-500">No wallets created yet</p>
                </div>
              ) : (
                <div className="space-y-4 mb-8">
                  {wallets.map((w, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl p-6 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            w.type === 'ethereum' ? 'bg-blue-100' : 'bg-purple-100'
                          }`}>
                            <span className={`font-bold text-sm ${
                              w.type === 'ethereum' ? 'text-blue-600' : 'text-purple-600'
                            }`}>
                              {w.type === 'ethereum' ? 'Ξ' : '◎'}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {w.type === 'ethereum' ? 'Ethereum' : 'Solana'} Wallet #{i + 1}
                            </h3>
                            <div className="text-sm text-gray-500">Path: {w.path}</div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Address</label>
                          <div className="flex items-center mt-1">
                            <code className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm font-mono break-all">{w.address}</code>
                            <button 
                              className="ml-2 p-2 text-gray-500 hover:text-blue-600 transition-colors"
                              onClick={() => copyToClipboard(w.address)}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <details className="group">
                          <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium">
                            Show Private Key ↓
                          </summary>
                          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="text-xs text-red-600 mb-2">⚠️ Never share your private key</div>
                            <code className="text-xs font-mono break-all text-red-800">{w.privateKey}</code>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                  onClick={() => setPage(3)}
                >
                  View Seed Phrase
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Selector Modal */}
      {showAccountSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Select Account</h3>
                <button
                  onClick={() => setShowAccountSelector(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {accounts.map((account) => (
                  <div 
                    key={account.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      account.id === currentAccountId 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => switchToAccount(account.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{account.name}</div>
                        <div className="text-sm text-gray-500">
                          {account.wallets.length} wallet{account.wallets.length !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-gray-400">
                          Created {new Date(account.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {account.id === currentAccountId && (
                          <span className="text-blue-600 text-sm font-medium">Current</span>
                        )}
                        {accounts.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
                                deleteAccount(account.id);
                              }
                            }}
                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setShowAccountSelector(false);
                  setPage(2);
                }}
                className="w-full mt-4 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Create New Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Import Existing Wallet</h3>
                <button
                  onClick={resetImportModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-600 mb-4">Enter your 12-word recovery phrase to import your existing wallet.</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-yellow-800 text-sm">Security Warning</h4>
                      <p className="text-yellow-700 text-sm mt-1">Only import seed phrases you trust. Never enter your seed phrase on suspicious websites.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Recovery Phrase (12 words)
                </label>
                <textarea
                  value={importPhrase}
                  onChange={(e) => {
                    setImportPhrase(e.target.value);
                    if (importError) setImportError(""); // Clear error on input
                  }}
                  placeholder="Enter your 12-word recovery phrase separated by spaces..."
                  className={`w-full p-4 border rounded-xl font-mono text-sm resize-none h-32 ${
                    importError ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  rows={4}
                />
                {importError && (
                  <p className="text-red-600 text-sm mt-2 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {importError}
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-blue-800 text-sm mb-2">Tips:</h4>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• Make sure words are separated by spaces</li>
                  <li>• Check for typos in your seed phrase</li>
                  <li>• Ensure you have exactly 12 words</li>
                  <li>• Words should be in the correct order</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={resetImportModal}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportWallet}
                  disabled={!importPhrase.trim()}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
                    importPhrase.trim()
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Import Wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
