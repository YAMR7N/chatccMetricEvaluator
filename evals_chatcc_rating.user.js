// ==UserScript==
// @name         ChatCC Conversation Evaluator
// @namespace    http://tampermonkey.net/
// @version      1.6.6
// @description  Rate conversations and manage evaluation metrics for ChatCC
// @author       ChatCC Team
// @match        https://erp.maids.cc/chatcc*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      docs.google.com
// @connect      n8n-staging.teljoy.io
// @connect      chadykarimfarah-manouella.app.n8n.cloud
// @updateURL    https://chatcc-metric-evaluator.vercel.app/evals_chatcc_ratings.user.js
// @downloadURL  https://chatcc-metric-evaluator.vercel.app/evals_chatcc_ratings.user.js
// ==/UserScript==

(function() {
    'use strict';

    const SHEET_ID = '1ABDpeyU3FGEdvd9vHHrln-hVX83NwCfA7fsqqDaXPVY';
    const ADD_METRIC_WEBHOOK = 'https://n8n-staging.teljoy.io/webhook/add-eval-metric';
    const RATE_CONVERSATION_WEBHOOK = 'https://chadykarimfarah-manouella.app.n8n.cloud/webhook/add-eval-rating';

    let sheetsData = {
        metricAddition: [],
        metrics: [],
        configuration: [],
        ratedConversations: []
    };

    let currentUsername = '';
    let currentSkill = '';
    let currentConversationId = '';
    let isAlreadyRated = false;
    let activeModalOverlay = null; // Track if rating panel is open
    let lastKnownConversationId = ''; // For detecting conversation changes
    let conversationCheckInterval = null; // Interval for checking conversation changes

    // Add custom styles - Redesigned with ChatCC color scheme and Nielsen principles
    GM_addStyle(`
        /* Primary Colors - Matching ChatCC Platform */
        :root {
            --eval-orange:rgb(255, 167, 53);
            --eval-orange-hover:rgb(229, 148, 43);
            --eval-orange-light: rgba(255, 107, 53, 0.1);
            --eval-dark-bg: #1e2936;
            --eval-card-bg: #293846;
            --eval-border: #3d4a5c;
            --eval-text-primary: #ffffff;
            --eval-text-secondary: #b0b0b0;
            --eval-text-muted: #808080;
            --eval-success: #10B981;
            --eval-error: #EF4444;
            --eval-warning: #F59E0B;
        }

        /* Ensure all text elements have proper colors */
        .eval-modal,
        .eval-modal * {
            color: var(--eval-text-primary);
        }

        .eval-modal span,
        .eval-modal p,
        .eval-modal div {
            color: inherit;
        }

        /* Force text visibility for all inputs */
        .eval-modal input[type="text"],
        .eval-modal input[type="number"],
        .eval-modal input[type="email"],
        .eval-modal input[type="password"],
        .eval-modal input[type="search"],
        .eval-modal textarea {
            color: var(--eval-text-primary) !important;
        }

        /* Force placeholder visibility */
        .eval-modal input::placeholder,
        .eval-modal textarea::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.7 !important;
        }

        /* Force select text visibility */
        .eval-modal select {
            color: var(--eval-text-primary) !important;
        }

        /* Force option text visibility */
        .eval-modal select option {
            color: var(--eval-text-primary) !important;
            background: var(--eval-card-bg) !important;
        }

        .eval-button {
            background: var(--eval-orange);
            border: none;
            cursor: pointer;
            padding: 8px 16px;
            border-radius: 8px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-right: 10px;
            position: relative;
            top: -6px;
            font-weight: 500;
            font-size: 14px;
            color: white;
            box-shadow: 0 2px 8px rgba(255, 147, 53, 0.3);
        }

        .eval-button:hover {
            background-color: var(--eval-orange-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 157, 53, 0.4);
        }

        .eval-button:active {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(255, 147, 53, 0.3);
        }

        .eval-button svg {
            width: 18px;
            height: 18px;
            fill: white;
            transition: all 0.2s;
        }

        .eval-button:hover svg {
            transform: scale(1.05);
        }

        .eval-modal-overlay {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 0;
            background: transparent;
            z-index: 10000;
            pointer-events: none;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .eval-modal {
            position: fixed;
            top: 0;
            right: 0;
            height: 100vh;
            width: 480px;
            max-width: 90vw;
            background: var(--eval-dark-bg);
            display: flex;
            flex-direction: column;
            box-shadow: -8px 0 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
            color: var(--eval-text-primary);
            animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            pointer-events: auto;
            z-index: 10001;
        }

        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        /* Resize handle for side panel */
        .eval-resize-handle {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 8px;
            cursor: ew-resize;
            background: linear-gradient(90deg, rgba(255, 147, 53, 0.3) 0%, transparent 100%);
            transition: all 0.2s;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .eval-resize-handle::before {
            content: '';
            width: 4px;
            height: 40px;
            background: var(--eval-orange);
            border-radius: 2px;
            opacity: 0.5;
            transition: all 0.2s;
        }

        .eval-resize-handle:hover,
        .eval-resize-handle.resizing {
            background: linear-gradient(90deg, rgba(255, 107, 53, 0.5) 0%, transparent 100%);
            width: 10px;
        }

        .eval-resize-handle:hover::before,
        .eval-resize-handle.resizing::before {
            opacity: 1;
            height: 60px;
            box-shadow: 0 0 8px rgba(255, 107, 53, 0.5);
        }

        /* Resize tooltip */
        .eval-resize-tooltip {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            background: var(--eval-card-bg);
            border: 1px solid var(--eval-orange);
            color: var(--eval-text-primary);
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .eval-resize-handle:hover .eval-resize-tooltip {
            opacity: 1;
        }

        .eval-modal-header {
            padding: 24px 28px;
            border-bottom: 1px solid var(--eval-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, rgba(255, 107, 53, 0.05) 0%, transparent 100%);
        }

        .eval-modal-header h2 {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            color: var(--eval-text-primary);
            letter-spacing: -0.3px;
        }

        .eval-modal-close {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--eval-border);
            color: var(--eval-text-secondary);
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            transition: all 0.2s;
            font-weight: 300;
        }

        .eval-modal-close:hover {
            background: rgba(255, 107, 53, 0.1);
            border-color: var(--eval-orange);
            color: var(--eval-orange);
            transform: scale(1.1);
        }

        .eval-modal-tabs {
            display: flex;
            border-bottom: 2px solid var(--eval-border);
            padding: 0 28px;
            background: var(--eval-card-bg);
        }

        .eval-tab {
            padding: 16px 24px;
            background: none;
            border: none;
            color: var(--eval-text-muted);
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            border-bottom: 3px solid transparent;
            transition: all 0.2s;
            position: relative;
            margin-bottom: -2px;
        }

        .eval-tab:hover {
            color: var(--eval-text-primary);
            background: rgba(255, 255, 255, 0.03);
        }

        .eval-tab.active {
            color: var(--eval-orange);
            border-bottom-color: var(--eval-orange);
        }

        .eval-modal-body {
            padding: 28px;
            overflow-y: auto;
            flex: 1;
            background: var(--eval-dark-bg);
        }

        .eval-modal-body::-webkit-scrollbar {
            width: 8px;
        }

        .eval-modal-body::-webkit-scrollbar-track {
            background: var(--eval-card-bg);
        }

        .eval-modal-body::-webkit-scrollbar-thumb {
            background: var(--eval-border);
            border-radius: 4px;
        }

        .eval-modal-body::-webkit-scrollbar-thumb:hover {
            background: var(--eval-orange);
        }

        .eval-form-group {
            margin-bottom: 32px;
            padding-bottom: 28px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .eval-form-group:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .eval-form-group label {
            display: block;
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: 500;
            color: var(--eval-text-secondary);
            letter-spacing: 0.2px;
        }

        .eval-form-group input,
        .eval-form-group select {
            width: 100%;
            padding: 12px 16px;
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 8px;
            color: var(--eval-text-primary) !important;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s;
            font-family: inherit;
        }

        .eval-form-group input[type="text"],
        .eval-form-group input[type="number"],
        .eval-form-group input[type="email"],
        .eval-form-group input[type="password"],
        .eval-form-group .metric-name,
        .eval-form-group .list-value-input {
            color: var(--eval-text-primary) !important;
        }

        .eval-form-group input::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.7;
        }

        .eval-form-group select {
            color: var(--eval-text-primary) !important;
        }

        .eval-form-group select option {
            background: var(--eval-card-bg) !important;
            color: var(--eval-text-primary) !important;
        }

        .eval-form-group input:focus,
        .eval-form-group select:focus {
            outline: none;
            border-color: var(--eval-orange);
            box-shadow: 0 0 0 3px var(--eval-orange-light);
            background: rgba(255, 107, 53, 0.03);
            color: var(--eval-text-primary) !important;
        }

        .eval-list-builder {
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 8px;
            padding: 16px;
        }

        .eval-list-input-row {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }

        .eval-list-input-row input {
            flex: 1;
            margin-bottom: 0;
            color: var(--eval-text-primary) !important;
            background: var(--eval-card-bg) !important;
            border: 1.5px solid var(--eval-border) !important;
        }

        .eval-list-input-row input::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.7;
        }

        .eval-list-input-row input:focus {
            color: var(--eval-text-primary) !important;
        }

        .eval-list-add-btn {
            padding: 12px 20px;
            background: var(--eval-orange);
            border: none;
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .eval-list-add-btn:hover {
            background: var(--eval-orange-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(255, 147, 53, 0.3);
        }

        .eval-list-items {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 12px;
        }

        .eval-process-json-btn {
            margin-top: 12px;
            padding: 10px 20px;
            background: var(--eval-orange);
            border: none;
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            width: 100%;
        }

        .eval-process-json-btn:hover {
            background: var(--eval-orange-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(255, 147, 53, 0.3);
        }

        .eval-template-preview {
            margin-top: 16px;
        }

        .eval-template-preview-content {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--eval-border);
            border-radius: 6px;
            padding: 12px;
            max-height: 300px;
            overflow-y: auto;
        }

        .eval-template-preview-content pre {
            margin: 0;
            color: var(--eval-text-primary);
            font-size: 12px;
            font-family: 'Courier New', monospace;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .metric-template-json {
            width: 100%;
            min-height: 200px;
            padding: 16px;
            background: rgba(0, 0, 0, 0.4);
            border: 2px dashed var(--eval-border);
            border-radius: 8px;
            color: var(--eval-text-primary) !important;
            font-size: 13px;
            font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
            resize: vertical;
            box-sizing: border-box;
            transition: all 0.2s;
        }

        .metric-template-json::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.6;
        }

        .metric-template-json:focus {
            outline: none;
            border-color: var(--eval-orange);
            border-style: solid;
            box-shadow: 0 0 0 3px var(--eval-orange-light);
            background: rgba(255, 167, 53, 0.03);
        }

        .metric-template-json:not(:placeholder-shown) {
            border-style: solid;
            border-color: var(--eval-success);
        }

        .eval-list-item {
            background: rgba(255, 107, 53, 0.1);
            border: 1px solid rgba(255, 107, 53, 0.2);
            padding: 8px 14px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            color: var(--eval-text-primary) !important;
        }

        .eval-list-item span {
            color: var(--eval-text-primary) !important;
        }

        .eval-list-item-remove {
            background: none;
            border: none;
            color: var(--eval-error);
            cursor: pointer;
            padding: 0;
            font-size: 18px;
            line-height: 1;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .eval-list-item-remove:hover {
            background: rgba(239, 68, 68, 0.1);
            transform: scale(1.1);
        }

        .eval-skills-selector {
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 8px;
            padding: 16px;
            max-height: 220px;
            overflow-y: auto;
        }

        .eval-skills-selector::-webkit-scrollbar {
            width: 6px;
        }

        .eval-skills-selector::-webkit-scrollbar-thumb {
            background: var(--eval-border);
            border-radius: 3px;
        }

        .eval-skill-checkbox {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 0;
            cursor: pointer;
            transition: all 0.15s;
            border-radius: 6px;
            padding-left: 8px;
            margin-left: -8px;
            color: var(--eval-text-primary);
        }

        .eval-skill-checkbox:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .eval-skill-checkbox span {
            color: var(--eval-text-primary);
        }

        .eval-skill-checkbox input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--eval-orange);
        }

        .eval-metric-card {
            background: var(--eval-card-bg);
            border: 1px solid var(--eval-border);
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 16px;
            transition: all 0.2s;
        }

        .eval-metric-card:hover {
            border-color: rgba(255, 107, 53, 0.2);
        }

        .eval-metric-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
            gap: 12px;
            cursor: pointer;
            user-select: none;
        }

        .eval-metric-card-header:hover {
            opacity: 0.8;
        }

        .eval-metric-card-header .eval-expand-icon {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            fill: var(--eval-orange);
            transition: transform 0.3s ease;
        }

        .eval-metric-card.collapsed .eval-expand-icon {
            transform: rotate(-90deg);
        }

        .eval-metric-card.collapsed .eval-metric-input-group {
            display: none;
        }

        .eval-metric-edit-btn {
            background: none;
            border: 1px solid var(--eval-border);
            color: var(--eval-text-muted);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            margin-right: 8px;
            transition: all 0.2s;
        }

        .eval-metric-edit-btn:hover {
            border-color: var(--eval-orange);
            color: var(--eval-orange);
        }

        .eval-edit-controls {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
            padding: 16px;
            background: rgba(255, 107, 53, 0.05);
            border: 1px solid rgba(255, 107, 53, 0.2);
            border-radius: 8px;
        }

        .eval-toggle-container {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .eval-toggle-label {
            color: var(--eval-text-secondary);
            font-size: 14px;
        }

        .eval-toggle {
            position: relative;
            width: 48px;
            height: 26px;
            background: var(--eval-border);
            border-radius: 13px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .eval-toggle.active {
            background: var(--eval-success);
        }

        .eval-toggle::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            transition: all 0.3s;
        }

        .eval-toggle.active::after {
            left: 25px;
        }

        .eval-save-btn {
            background: var(--eval-orange);
            border: none;
            color: white;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .eval-save-btn:hover {
            background: var(--eval-orange-hover);
        }

        .eval-save-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .eval-cancel-edit-btn {
            background: none;
            border: 1px solid var(--eval-border);
            color: var(--eval-text-muted);
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }

        .eval-cancel-edit-btn:hover {
            border-color: var(--eval-text-secondary);
            color: var(--eval-text-secondary);
        }

        .eval-metric-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 107, 53, 0.15);
            border: 1px solid rgba(255, 147, 53, 0.3);
            padding: 4px 10px;
            border-radius: 12px;
            margin-bottom: 10px;
            font-size: 11px;
            font-weight: 600;
            color: var(--eval-orange);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .eval-metric-badge svg {
            flex-shrink: 0;
        }

        .eval-metric-card h4 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: var(--eval-text-primary);
            flex: 1;
            line-height: 1.4;
        }

        .eval-metric-type {
            display: inline-block;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--eval-border);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 500;
            color: var(--eval-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.6;
        }

        .eval-metric-help {
            font-size: 13px;
            color: var(--eval-text-muted);
            margin-top: 4px;
            font-style: italic;
            line-height: 1.4;
        }

        .eval-metric-input-group {
            margin-top: 12px;
        }

        .eval-sub-field-card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--eval-border);
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 12px;
        }

        .eval-sub-field-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--eval-orange);
            margin: 0 0 12px 0;
        }

        /* Sub-metric collapsible styles */
        .eval-sub-metric {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--eval-border);
            border-radius: 6px;
            margin-bottom: 12px;
            overflow: hidden;
            transition: all 0.2s;
        }

        .eval-sub-metric-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s;
        }

        .eval-sub-metric-header:hover {
            background: rgba(255, 107, 53, 0.05);
        }

        .eval-sub-metric-header h5 {
            font-size: 15px;
            font-weight: 600;
            color: var(--eval-orange);
            margin: 0;
            flex: 1;
        }

        .eval-sub-metric-expand-icon {
            width: 20px;
            height: 20px;
            fill: var(--eval-text-secondary);
            transition: transform 0.2s;
            flex-shrink: 0;
        }

        .eval-sub-metric.collapsed .eval-sub-metric-expand-icon {
            transform: rotate(-90deg);
        }

        .eval-sub-metric-content {
            padding: 0 16px 12px 16px;
            max-height: 2000px;
            overflow: hidden;
            transition: all 0.3s ease-in-out;
        }

        .eval-sub-metric.collapsed .eval-sub-metric-content {
            max-height: 0;
            padding-top: 0;
            padding-bottom: 0;
        }

        .eval-sub-field-inputs {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .eval-field-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .eval-field-label {
            font-size: 13px;
            font-weight: 500;
            color: var(--eval-text-secondary);
        }

        .eval-field-group:has(input[required]) .eval-field-label,
        .eval-field-group:has(input[type="radio"][required]) .eval-field-label {
            font-weight: 600;
        }

        .eval-field-group input[type="text"],
        .eval-field-group input[type="number"],
        .eval-field-group textarea {
            width: 100%;
            padding: 10px 14px;
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 6px;
            color: var(--eval-text-primary) !important;
            font-size: 13px;
            box-sizing: border-box;
            transition: all 0.2s;
            font-family: inherit;
        }

        .eval-field-group textarea {
            resize: vertical;
            min-height: 60px;
        }

        .eval-field-group input::placeholder,
        .eval-field-group textarea::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.7;
        }

        .eval-field-group input:focus,
        .eval-field-group textarea:focus {
            outline: none;
            border-color: var(--eval-orange);
            box-shadow: 0 0 0 3px var(--eval-orange-light);
            background: rgba(255, 107, 53, 0.03);
            color: var(--eval-text-primary) !important;
        }

        .eval-metric-input-group input[type="number"] {
            width: 100%;
            padding: 12px 16px;
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 8px;
            color: var(--eval-text-primary) !important;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s;
            font-family: inherit;
        }

        .eval-metric-input-group input[type="number"]::placeholder {
            color: var(--eval-text-muted) !important;
            opacity: 0.7;
        }

        .eval-metric-input-group input[type="number"]:focus {
            outline: none;
            border-color: var(--eval-orange);
            box-shadow: 0 0 0 3px var(--eval-orange-light);
            background: rgba(255, 107, 53, 0.03);
            color: var(--eval-text-primary) !important;
        }

        .eval-rating-group {
            display: flex;
            gap: 12px;
            align-items: center;
            flex-wrap: wrap;
        }

        .eval-rating-options {
            display: flex;
            gap: 12px;
        }

        .eval-checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 10px 16px;
            border-radius: 8px;
            border: 1.5px solid var(--eval-border);
            background: var(--eval-card-bg);
            transition: all 0.2s;
            font-weight: 500;
            color: var(--eval-text-secondary);
        }

        .eval-checkbox-label:hover {
            border-color: var(--eval-orange);
            background: rgba(255, 107, 53, 0.05);
            color: var(--eval-text-primary);
        }

        .eval-checkbox-label input[type="radio"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--eval-orange);
        }

        .eval-checkbox-label span {
            color: inherit;
        }

        .eval-checkbox-label input[type="radio"]:checked + span {
            color: var(--eval-orange);
        }

        .eval-checkbox-label:has(input[type="radio"]:checked) {
            border-color: var(--eval-orange);
            background: rgba(255, 107, 53, 0.1);
            color: var(--eval-orange);
        }

        .eval-checkbox-label:has(input[type="radio"]:checked) span {
            color: var(--eval-orange);
        }

        .eval-skip-link {
            color: var(--eval-text-muted);
            text-decoration: none;
            font-size: 13px;
            padding: 10px 12px;
            border-radius: 6px;
            transition: all 0.2s;
            cursor: pointer;
            border: none;
            background: none;
            font-family: inherit;
        }

        .eval-skip-link span {
            color: inherit;
        }

        .eval-skip-link:hover {
            color: var(--eval-text-secondary);
            background: rgba(255, 255, 255, 0.03);
            text-decoration: underline;
        }

        .eval-skip-link:hover span {
            color: inherit;
        }

        .eval-skip-link.active {
            color: var(--eval-orange);
            background: rgba(255, 107, 53, 0.1);
        }

        .eval-skip-link.active span {
            color: var(--eval-orange);
        }

        .eval-error-message {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-left: 4px solid var(--eval-error);
            color: var(--eval-error);
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .eval-warning-message {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-left: 4px solid var(--eval-warning);
            color: var(--eval-warning);
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .eval-warning-message svg {
            flex-shrink: 0;
        }

        .eval-warning-message span {
            color: var(--eval-warning);
        }

        .eval-keyboard-hint {
            font-size: 11px;
            color: var(--eval-text-muted);
            margin-left: 8px;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .eval-checkbox-label:hover .eval-keyboard-hint {
            opacity: 0.6;
        }

        .eval-multiselect {
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 8px;
            padding: 12px;
            max-height: 180px;
            overflow-y: auto;
        }

        .eval-multiselect::-webkit-scrollbar {
            width: 6px;
        }

        .eval-multiselect::-webkit-scrollbar-thumb {
            background: var(--eval-border);
            border-radius: 3px;
        }

        .eval-multiselect-option {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            color: var(--eval-text-primary);
        }

        .eval-multiselect-option:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .eval-multiselect-option span {
            color: var(--eval-text-primary);
        }

        .eval-multiselect-option input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--eval-orange);
        }

        .eval-modal-footer {
            padding: 20px 28px;
            border-top: 1px solid var(--eval-border);
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: var(--eval-card-bg);
        }

        .eval-modal-footer-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        .eval-btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            letter-spacing: 0.3px;
        }

        .eval-btn-primary {
            background: var(--eval-orange);
            color: #fff;
            box-shadow: 0 2px 8px rgba(255, 147, 53, 0.3);
        }

        .eval-btn-primary:hover:not(:disabled) {
            background: var(--eval-orange-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 157, 53, 0.4);
        }

        .eval-btn-primary:active:not(:disabled) {
            transform: translateY(0);
        }

        .eval-btn-secondary {
            background: var(--eval-card-bg);
            color: var(--eval-text-secondary);
            border: 1.5px solid var(--eval-border);
        }

        .eval-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: var(--eval-text-muted);
            color: var(--eval-text-primary);
        }

        .eval-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        .eval-loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: eval-spin 0.6s linear infinite;
        }

        @keyframes eval-spin {
            to { transform: rotate(360deg); }
        }

        .eval-alert {
            padding: 14px 18px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-left: 4px solid;
            font-weight: 500;
        }

        .eval-alert-success {
            background: rgba(16, 185, 129, 0.1);
            border-left-color: var(--eval-success);
            color: var(--eval-success);
        }

        .eval-alert-error {
            background: rgba(239, 68, 68, 0.1);
            border-left-color: var(--eval-error);
            color: var(--eval-error);
        }

        .eval-alert-warning {
            background: rgba(245, 158, 11, 0.1);
            border-left-color: var(--eval-warning);
            color: var(--eval-warning);
        }

        .eval-banner {
            position: fixed;
            top: 70px;
            right: 20px;
            background: linear-gradient(135deg, var(--eval-warning) 0%, #F59E0B 100%);
            color: #fff;
            padding: 14px 22px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4);
            z-index: 9999;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .eval-confirm-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--eval-card-bg);
            border: 1px solid var(--eval-border);
            border-radius: 12px;
            padding: 24px;
            z-index: 10001;
            min-width: 400px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            animation: fadeInScale 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .eval-confirm-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            animation: fadeIn 0.2s;
        }

        @keyframes fadeInScale {
            from {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .eval-confirm-dialog h3 {
            margin: 0 0 12px 0;
            color: var(--eval-warning);
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .eval-confirm-dialog p {
            margin: 0 0 24px 0;
            color: var(--eval-text-secondary);
            line-height: 1.5;
        }

        .eval-confirm-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }

        .eval-confirm-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .eval-confirm-btn-no {
            background: var(--eval-border);
            color: var(--eval-text-primary);
        }

        .eval-confirm-btn-no:hover {
            background: #4a4a4a;
        }

        .eval-confirm-btn-yes {
            background: var(--eval-orange);
            color: white;
        }

        .eval-confirm-btn-yes:hover {
            background: var(--eval-orange-hover);
        }

        /* Process Metric UI Styles */
        .eval-process-container {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--eval-border);
        }

        .eval-config-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 14px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 8px;
            overflow: hidden;
        }

        .eval-config-table th {
            text-align: left;
            padding: 12px 16px;
            background: rgba(255, 167, 53, 0.1);
            color: var(--eval-orange);
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid var(--eval-border);
        }

        .eval-config-table td {
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            vertical-align: middle;
        }

        .eval-config-table tbody tr:hover {
            background: rgba(255, 255, 255, 0.02);
        }

        .eval-config-table input,
        .eval-config-table select {
            width: 100%;
            padding: 10px 12px;
            background: rgba(0, 0, 0, 0.3);
            border: 1.5px solid var(--eval-border);
            border-radius: 6px;
            color: var(--eval-text-primary);
            transition: all 0.2s;
        }

        .eval-config-table input:focus,
        .eval-config-table select:focus {
            outline: none;
            border-color: var(--eval-orange);
            background: rgba(255, 167, 53, 0.05);
        }

        .eval-action-btn {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--eval-error);
            cursor: pointer;
            padding: 6px;
            border-radius: 6px;
            transition: all 0.2s;
        }

        .eval-action-btn:hover {
            background: rgba(239, 68, 68, 0.2);
            border-color: var(--eval-error);
            transform: scale(1.05);
        }

        .conf-list-builder {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .conf-list-items {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            min-height: 32px;
            padding: 6px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--eval-border);
            border-radius: 4px;
        }

        .conf-list-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--eval-orange);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
        }

        .conf-list-remove {
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            margin: 0;
            opacity: 0.8;
            transition: opacity 0.2s;
        }

        .conf-list-remove:hover {
            opacity: 1;
        }

        .conf-list-add-container {
            display: flex;
            gap: 4px;
        }

        .conf-list-input {
            flex: 1;
            padding: 6px 8px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--eval-border);
            border-radius: 4px;
            color: var(--eval-text-primary);
            font-size: 13px;
        }

        .conf-list-add-btn {
            background: var(--eval-orange);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            transition: all 0.2s;
        }

        .conf-list-add-btn:hover {
            background: var(--eval-orange-hover);
        }

        .conf-list-add-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .eval-action-btn:hover {
            color: var(--eval-error);
            background: rgba(239, 68, 68, 0.1);
        }

        .eval-preview-tree {
            background: rgba(0, 0, 0, 0.2);
            padding: 16px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            line-height: 1.5;
            color: var(--eval-text-secondary);
            max-height: 300px;
            overflow-y: auto;
        }

        .eval-btn-group {
            display: flex;
            gap: 12px;
            margin-top: 16px;
        }

        .eval-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }

        .eval-badge-simple {
            background: rgba(16, 185, 129, 0.1);
            color: var(--eval-success);
        }

        .eval-badge-complex {
            background: rgba(245, 158, 11, 0.1);
            color: var(--eval-warning);
        }

        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .eval-add-metric-btn {
            width: 100%;
            padding: 14px;
            background: var(--eval-orange);
            border: none;
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            margin-top: 16px;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(255, 147, 53, 0.3);
        }

        .eval-add-metric-btn:hover {
            background: var(--eval-orange-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 157, 53, 0.4);
        }

        .eval-metric-form-card {
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            position: relative;
            transition: all 0.3s;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .eval-metric-form-card:hover {
            border-color: rgba(255, 167, 53, 0.4);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .eval-remove-metric-form {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: var(--eval-error);
            cursor: pointer;
            font-size: 20px;
            padding: 6px 10px;
            border-radius: 6px;
            transition: all 0.2s;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .eval-remove-metric-form:hover {
            background: rgba(239, 68, 68, 0.2);
            transform: scale(1.1);
        }

        .eval-divider {
            height: 1px;
            background: var(--eval-border);
            margin: 24px 0;
        }

        .eval-no-permission {
            text-align: center;
            padding: 60px 20px;
            color: var(--eval-text-muted);
        }

        .eval-no-metrics {
            text-align: center;
            padding: 60px 20px;
            color: var(--eval-text-muted);
        }

        .eval-no-metrics svg {
            opacity: 0.5;
            margin-bottom: 16px;
        }

        /* ========== NEW UX IMPROVEMENTS ========== */

        /* Search Bar */
        .eval-search-container {
            padding: 0 0 16px 0;
            position: relative;
        }

        .eval-search-input {
            width: 100%;
            padding: 12px 16px 12px 44px;
            background: var(--eval-card-bg);
            border: 1.5px solid var(--eval-border);
            border-radius: 10px;
            color: var(--eval-text-primary);
            font-size: 14px;
            transition: all 0.2s;
            box-sizing: border-box;
        }

        .eval-search-input:focus {
            outline: none;
            border-color: var(--eval-orange);
            box-shadow: 0 0 0 3px var(--eval-orange-light);
        }

        .eval-search-input::placeholder {
            color: var(--eval-text-muted);
        }

        .eval-search-icon {
            position: absolute;
            left: 14px;
            top: 14px;
            color: var(--eval-text-muted);
            pointer-events: none;
        }

        .eval-search-clear {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--eval-text-muted);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: none;
            transition: all 0.2s;
        }

        .eval-search-clear:hover {
            color: var(--eval-orange);
            background: var(--eval-orange-light);
        }

        .eval-search-container.has-value .eval-search-clear {
            display: block;
        }

        .eval-no-results {
            text-align: center;
            padding: 40px 20px;
            color: var(--eval-text-muted);
        }

        .eval-metric-card.hidden-by-search {
            display: none !important;
        }

        /* Progress Indicator */
        .eval-progress-container {
            padding: 16px 0;
            border-bottom: 1px solid var(--eval-border);
            margin-bottom: 16px;
        }

        .eval-progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .eval-progress-text {
            font-size: 13px;
            color: var(--eval-text-secondary);
        }

        .eval-progress-count {
            font-weight: 600;
            color: var(--eval-orange);
        }

        .eval-progress-bar {
            height: 6px;
            background: var(--eval-border);
            border-radius: 3px;
            overflow: hidden;
        }

        .eval-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--eval-orange) 0%, var(--eval-success) 100%);
            border-radius: 3px;
            transition: width 0.3s ease;
        }

        /* Toolbar */
        .eval-toolbar {
            display: flex;
            gap: 8px;
            padding: 12px 0;
            border-bottom: 1px solid var(--eval-border);
            margin-bottom: 16px;
            flex-wrap: wrap;
        }

        .eval-toolbar-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: var(--eval-card-bg);
            border: 1px solid var(--eval-border);
            border-radius: 6px;
            color: var(--eval-text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .eval-toolbar-btn:hover {
            border-color: var(--eval-orange);
            color: var(--eval-orange);
            background: var(--eval-orange-light);
        }

        .eval-toolbar-btn.active {
            background: var(--eval-orange);
            border-color: var(--eval-orange);
            color: white;
        }

        .eval-toolbar-btn svg {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }

        /* Completed metric indicator */
        .eval-metric-card.completed {
            border-color: var(--eval-success);
            background: rgba(16, 185, 129, 0.03);
        }

        .eval-metric-card.completed .eval-metric-badge {
            background: rgba(16, 185, 129, 0.15);
            border-color: rgba(16, 185, 129, 0.3);
            color: var(--eval-success);
        }

        .eval-completed-check {
            display: none;
            color: var(--eval-success);
            margin-left: 8px;
        }

        .eval-metric-card.completed .eval-completed-check {
            display: inline-flex;
        }

        /* Jump to next button */
        .eval-jump-next {
            position: fixed;
            bottom: 100px;
            right: 30px;
            background: var(--eval-orange);
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 24px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(255, 157, 53, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 10001;
            transition: all 0.2s;
            animation: pulse-glow 2s infinite;
        }

        .eval-jump-next:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 107, 53, 0.5);
        }

        .eval-jump-next.hidden {
            display: none;
        }

        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 4px 12px rgba(255, 157, 53, 0.4); }
            50% { box-shadow: 0 4px 20px rgba(255, 151, 53, 0.6); }
        }

        /* Refresh overlay indicator */
        .eval-refresh-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 26, 26, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 100;
            animation: fadeIn 0.2s ease-out;
        }

        .eval-refresh-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--eval-border);
            border-top-color: var(--eval-orange);
            border-radius: 50%;
            animation: eval-spin 0.8s linear infinite;
        }

        .eval-refresh-text {
            margin-top: 16px;
            color: var(--eval-text-secondary);
            font-size: 14px;
        }

        .eval-refresh-convo {
            margin-top: 8px;
            color: var(--eval-orange);
            font-size: 12px;
            font-weight: 500;
        }

        /* Info header for side panel */
        .eval-info-bar {
            padding: 12px 16px;
            background: linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 107, 53, 0.02) 100%);
            border-bottom: 1px solid var(--eval-border);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .eval-info-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }

        .eval-info-label {
            color: var(--eval-text-muted);
        }

        .eval-info-value {
            color: var(--eval-text-primary);
            font-weight: 500;
        }

        .eval-info-value.highlight {
            color: var(--eval-orange);
        }
    `);

    // Utility Functions
    function toCamelCase(str) {
        return str
            .split(' ')
            .map((word, index) => {
                word = word.toLowerCase();
                if (index === 0) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join('');
    }

    function parseCSV(text) {
        if (!text || !text.trim()) return [];

        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        // Parse character by character to handle multi-line cells
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote (two consecutive quotes)
                    currentField += '"';
                    i++; // Skip the next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                currentRow.push(currentField);
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // End of row (only if not inside quotes)
                if (char === '\r' && nextChar === '\n') {
                    i++; // Skip \n in \r\n
                }
                currentRow.push(currentField);
                currentField = '';

                if (currentRow.some(field => field.trim())) {
                    rows.push(currentRow);
                }
                currentRow = [];
            } else {
                // Regular character
                currentField += char;
            }
        }

        // Push last field and row
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField);
            if (currentRow.some(field => field.trim())) {
                rows.push(currentRow);
            }
        }

        if (rows.length === 0) return [];

        // First row is headers
        const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
        const data = [];

        // Process data rows
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const obj = {};

            headers.forEach((header, index) => {
                let value = row[index] || '';
                // Remove surrounding quotes if present
                value = value.replace(/^"|"$/g, '').trim();
                obj[header] = value;
            });

            data.push(obj);
        }

        return data;
    }

    async function fetchGoogleSheet(sheetName) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`,
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(parseCSV(response.responseText));
                    } else {
                        reject(new Error(`Failed to fetch sheet: ${sheetName}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    async function loadAllSheets() {
        try {
            const [metricAddition, metrics, configuration] = await Promise.all([
                fetchGoogleSheet('Metric Addition'),
                fetchGoogleSheet('Metrics'),
                fetchGoogleSheet('Configuration')
            ]);

            sheetsData.metricAddition = metricAddition;

            // Expand metrics with comma-separated definitions
            const expandedMetrics = [];
            metrics.filter(m => m.Enabled && m.Enabled.toLowerCase() === 'true').forEach(metric => {
                if (metric.Definition && metric.Definition.includes(',')) {
                    const definitions = metric.Definition.split(',').map(d => d.trim());
                    const descriptions = metric.Description ? metric.Description.split(',').map(d => d.trim()) : [];

                    definitions.forEach((def, index) => {
                        expandedMetrics.push({
                            ...metric,
                            Definition: def,
                            Description: descriptions[index] || ''
                        });
                    });
                } else {
                    expandedMetrics.push(metric);
                }
            });

            sheetsData.metrics = expandedMetrics;
            sheetsData.configuration = configuration;

            sheetsData.ratedConversations = configuration.filter(row =>
                row['Rated Conversations'] && row['Rated Conversations'].trim() !== ''
            );

            return true;
        } catch (error) {
            console.error('[EVAL] ❌ Error loading sheets:', error);
            return false;
        }
    }

    function getCurrentUserInfo() {
        const usernameEl = document.querySelector('.user-status-badge');
        currentUsername = usernameEl?.innerText.trim() || 'unknown';

        const skillEl = Array.from(document.querySelectorAll('.client-info-item')).find(el =>
            el.querySelector('.key')?.innerText.trim() === 'Skill'
        );
        currentSkill = skillEl?.querySelector('.value')?.innerText.trim() || '';

        const convIdEl = Array.from(document.querySelectorAll('.client-info-item')).find(el =>
            el.querySelector('.key')?.innerText.trim() === 'Conversation ID'
        );
        currentConversationId = convIdEl?.querySelector('.value')?.innerText.trim() || '';
    }

    function checkIfAlreadyRated() {
        isAlreadyRated = sheetsData.ratedConversations.some(row =>
            row.Skill?.toLowerCase() === currentSkill.toLowerCase() &&
            row['Rated Conversations'] === currentConversationId
        );
    }

    function showRatedBanner() {
        const existingBanner = document.querySelector('.eval-banner');
        if (existingBanner) existingBanner.remove();

        const banner = document.createElement('div');
        banner.className = 'eval-banner';
        banner.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
            <span>This conversation has already been rated</span>
        `;
        document.body.appendChild(banner);

        setTimeout(() => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateX(400px)';
            setTimeout(() => banner.remove(), 300);
        }, 5000);
    }

    function showConfirmDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'eval-confirm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'eval-confirm-dialog';
            dialog.innerHTML = `
                <h3>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                    Already Rated
                </h3>
                <p>This conversation has already been rated. Rating it again will override the previous evaluation. Do you want to proceed?</p>
                <div class="eval-confirm-actions">
                    <button class="eval-confirm-btn eval-confirm-btn-no">No</button>
                    <button class="eval-confirm-btn eval-confirm-btn-yes">Yes, Proceed</button>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(dialog);

            const cleanup = () => {
                overlay.remove();
                dialog.remove();
            };

            dialog.querySelector('.eval-confirm-btn-yes').addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            dialog.querySelector('.eval-confirm-btn-no').addEventListener('click', () => {
                cleanup();
                showRatedBanner();
                resolve(false);
            });

            overlay.addEventListener('click', () => {
                cleanup();
                showRatedBanner();
                resolve(false);
            });
        });
    }

    function showDefaultValuesConfirmation() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'eval-confirm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'eval-confirm-dialog';
            dialog.innerHTML = `
                <h3>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                    No Values Changed
                </h3>
                <p>You haven't changed any rating values. Submitting will use default values:</p>
                <ul style="text-align: left; margin: 16px 0; padding-left: 24px; color: var(--eval-text-secondary);">
                    <li><strong>Boolean fields:</strong> False</li>
                    <li><strong>Numerical fields:</strong> 0</li>
                    <li><strong>Text fields:</strong> Blank</li>
                </ul>
                <p>Do you want to proceed with these default values?</p>
                <div class="eval-confirm-actions">
                    <button class="eval-confirm-btn eval-confirm-btn-no">Cancel</button>
                    <button class="eval-confirm-btn eval-confirm-btn-yes">Yes, Submit Defaults</button>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(dialog);

            const cleanup = () => {
                overlay.remove();
                dialog.remove();
            };

            dialog.querySelector('.eval-confirm-btn-yes').addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            dialog.querySelector('.eval-confirm-btn-no').addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            overlay.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
        });
    }

    function hasPermissionToAddMetric() {
        // Check if user has permission (applies to all skills now)
        if (sheetsData.metricAddition.length === 0) return false;

        // Get the Permission column from any row (typically first row)
        const permissionRow = sheetsData.metricAddition[0];

        if (!permissionRow || !permissionRow.Permission) return false;

        const allowedUsers = permissionRow.Permission.split(',').map(u => u.trim().toLowerCase());
        return allowedUsers.includes(currentUsername.toLowerCase());
    }

    function getMetricsForSkill() {
        return sheetsData.metrics.filter(metric => {
            if (!metric.Skills) return false;

            const skills = metric.Skills.split(',').map(s => s.trim().toLowerCase());
            const hasAll = skills.includes('all');
            const hasCurrentSkill = skills.includes(currentSkill.toLowerCase());

            return hasAll || hasCurrentSkill;
        });
    }

    function getAllSkills() {
        return sheetsData.configuration
            .filter(row => row.Skill)
            .map(row => row.Skill.trim())
            .filter(skill => skill);
    }

    function metricExists(metricName) {
        return sheetsData.metrics.some(m =>
            m.Definition?.toLowerCase() === metricName.toLowerCase()
        );
    }

    // Modal Creation
    function createModal() {
        const overlay = document.createElement('div');
        overlay.className = 'eval-modal-overlay';

        const metrics = getMetricsForSkill();
        const totalMetrics = metrics.length;

        overlay.innerHTML = `
            <div class="eval-modal">
                <div class="eval-resize-handle"><span class="eval-resize-tooltip">← Drag to resize</span></div>
                <div class="eval-modal-header">
                    <h2>Rate Conversation</h2>
                    <button class="eval-modal-close" title="Close (Esc)">×</button>
                </div>
                <div class="eval-info-bar">
                    <div class="eval-info-item">
                        <span class="eval-info-label">Skill:</span>
                        <span class="eval-info-value highlight">${currentSkill || 'N/A'}</span>
                    </div>
                    <div class="eval-info-item">
                        <span class="eval-info-label">Conversation:</span>
                        <span class="eval-info-value">${currentConversationId || 'N/A'}</span>
                    </div>
                </div>
                <div class="eval-modal-tabs">
                    <button class="eval-tab active" data-tab="rate">Rate</button>
                    <button class="eval-tab" data-tab="view">View Metrics</button>
                    ${hasPermissionToAddMetric() ? '<button class="eval-tab" data-tab="add">Add Metric</button>' : ''}
                </div>
                <div class="eval-modal-body">
                    <div id="eval-rate-tab" class="eval-tab-content"></div>
                    <div id="eval-view-tab" class="eval-tab-content" style="display: none;"></div>
                    ${hasPermissionToAddMetric() ? '<div id="eval-add-tab" class="eval-tab-content" style="display: none;"></div>' : ''}
                </div>
                <div class="eval-modal-footer">
                    <div class="eval-modal-footer-actions">
                        <button class="eval-btn eval-btn-secondary eval-modal-close">Cancel</button>
                        <button class="eval-btn eval-btn-primary" id="eval-submit-btn">Submit</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        activeModalOverlay = overlay; // Track the active modal

        // Start polling for conversation changes
        startConversationPolling();

        // Setup resize functionality
        setupPanelResize(overlay);

        // Event listeners
        overlay.querySelectorAll('.eval-modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.remove();
                activeModalOverlay = null; // Clear reference when closed
                stopConversationPolling(); // Stop polling when closed
            });
        });

        overlay.querySelectorAll('.eval-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab, overlay));
        });

        // Render initial content
        renderRateTab(overlay);
        renderViewMetricsTab(overlay);
        if (hasPermissionToAddMetric()) {
            renderAddTab(overlay);
        }

        setupSubmitButton(overlay);
    }

    function switchTab(tabName, overlay) {
        overlay.querySelectorAll('.eval-tab').forEach(t => t.classList.remove('active'));
        overlay.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        overlay.querySelectorAll('.eval-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        overlay.querySelector(`#eval-${tabName}-tab`).style.display = 'block';

        // Update footer button visibility and text
        const submitBtn = overlay.querySelector('#eval-submit-btn');

        if (tabName === 'view') {
            submitBtn.style.display = 'none';
        } else {
            submitBtn.style.display = 'block';
            if (tabName === 'add') {
                // Check if we are in "processed" state
                const processPreview = overlay.querySelector('#eval-process-preview');
                if (processPreview && processPreview.style.display !== 'none') {
                    submitBtn.textContent = 'Submit Metric';
                } else {
                    submitBtn.textContent = 'Process Metric(s)';
                }
            } else {
                submitBtn.textContent = 'Submit';
            }
        }
    }

    // Setup panel resize functionality
    function setupPanelResize(overlay) {
        const modal = overlay.querySelector('.eval-modal');
        const handle = overlay.querySelector('.eval-resize-handle');

        let isResizing = false;
        let startX, startWidth;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = modal.offsetWidth;
            handle.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const diff = startX - e.clientX;
            const newWidth = Math.min(Math.max(startWidth + diff, 350), window.innerWidth * 0.8);
            modal.style.width = newWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    // Track rated metrics for progress
    let ratedMetricsCount = 0;
    let totalMetricsInView = 0;

    // Rate Tab
    function renderRateTab(overlay) {
        const container = overlay.querySelector('#eval-rate-tab');
        const metrics = getMetricsForSkill();

        if (metrics.length === 0) {
            container.innerHTML = `
                <div class="eval-no-metrics">
                    <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style="margin-bottom: 16px;">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <p>No metrics available for this skill</p>
                </div>
            `;
            return;
        }

        // Group metrics by template
        const templateGroups = new Map();

        metrics.forEach(metric => {
            const templateKey = metric.Template || `legacy_${metric.Definition}`;

            if (!templateGroups.has(templateKey)) {
                templateGroups.set(templateKey, []);
            }
            templateGroups.get(templateKey).push(metric);
        });

        totalMetricsInView = templateGroups.size;
        ratedMetricsCount = 0;

        // Build HTML with search, progress, and toolbar
        let html = `
            <!-- Search Bar -->
            <div class="eval-search-container">
                <svg class="eval-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input type="text" class="eval-search-input" placeholder="Search metrics..." id="eval-metric-search">
                <button class="eval-search-clear" id="eval-search-clear" title="Clear search">×</button>
            </div>

            <!-- Toolbar -->
            <div class="eval-toolbar">
                <button class="eval-toolbar-btn" id="expand-all-btn" title="Expand all metrics">
                    <svg viewBox="0 0 24 24"><path d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"/></svg>
                    Expand All
                </button>
                <button class="eval-toolbar-btn" id="collapse-all-btn" title="Collapse all metrics">
                    <svg viewBox="0 0 24 24"><path d="M7.41 18.59L8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z"/></svg>
                    Collapse All
                </button>
                <button class="eval-toolbar-btn" id="show-unrated-btn" title="Show only unrated metrics">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    Unrated Only
                </button>
            </div>

            <!-- Metrics Container -->
            <div id="metrics-container">
        `;

        let cardIndex = 0; // Track card count (not individual metric count)
        const totalCards = templateGroups.size; // Total number of cards

        templateGroups.forEach((groupedMetrics, templateKey) => {
            cardIndex++; // Increment for each card
            
            // Use first metric for template parsing
            const firstMetric = groupedMetrics[0];

            // Collect all metric names and descriptions
            const metricNames = groupedMetrics.map(m => m.Definition);
            const metricDescriptions = groupedMetrics.map(m => getMetricHelpText(m)).filter(d => d);
            const camelCaseNames = groupedMetrics.map(m => toCamelCase(m.Definition));

            // Badge text - just show card number
            const badgeText = `Metric ${cardIndex}/${totalCards}`;

            // Parse template if it exists
            let template = null;
            if (firstMetric.Template) {
                try {
                    template = JSON.parse(firstMetric.Template);
                } catch (e) {
                    console.error('[EVAL] Template parse error:', e);
                }
            }

            html += `
                <div class="eval-metric-card collapsed" data-metrics="${camelCaseNames.join(', ')}" data-metric-names="${metricNames.join(', ')}">
                    <div class="eval-metric-card-header">
                        <div style="flex: 1;">
                            <div class="eval-metric-badge">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                                <span>${badgeText}</span>
                                <span class="eval-completed-check" title="Rated">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                    </svg>
                                </span>
                            </div>
                            ${metricNames.map((name, idx) => `
                                <h4 style="${idx > 0 ? 'margin-top: 8px;' : ''}">${name}</h4>
                                ${metricDescriptions[idx] ? `<div class="eval-metric-help">${metricDescriptions[idx]}</div>` : ''}
                            `).join('')}
                        </div>
                        <svg class="eval-expand-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                        </svg>
                    </div>
                    <div class="eval-metric-input-group">
                        ${template ? renderTemplateBasedMetric(template, camelCaseNames) : renderLegacyMetricInput(firstMetric, camelCaseNames[0])}
                    </div>
                </div>
            `;
        });

        html += `</div>`; // Close metrics-container

        container.innerHTML = html;

        // Setup search functionality
        setupMetricSearch(container);

        // Setup toolbar buttons
        setupToolbar(container);

        // Setup collapsible metric cards
        container.querySelectorAll('.eval-metric-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't collapse if clicking on an input inside the header
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

                const card = header.closest('.eval-metric-card');
                card.classList.toggle('collapsed');
            });
        });

        // Setup collapsible sub-metrics
        container.querySelectorAll('.eval-sub-metric-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent parent card from toggling
                const subMetric = header.closest('.eval-sub-metric');
                subMetric.classList.toggle('collapsed');
            });
        });

        // Setup keyboard navigation
        setupKeyboardNavigation(container, overlay);

        // Prevent negative numbers in count inputs
        container.querySelectorAll('input[type="number"]').forEach(input => {
            // Prevent minus sign, decimal point, and scientific notation from being typed
            input.addEventListener('keydown', (e) => {
                // Block minus sign, decimal point, scientific notation, but allow backspace, delete, arrow keys, etc.
                if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '.') {
                    e.preventDefault();
                }
            });

            // Prevent negative values on paste
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const paste = (e.clipboardData || window.clipboardData).getData('text');
                const numericValue = parseInt(paste);
                if (!isNaN(numericValue) && numericValue >= 0) {
                    input.value = numericValue;
                }
            });

            // Ensure value stays >= 0 on input
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                // Remove any minus signs
                if (value.includes('-')) {
                    e.target.value = value.replace(/-/g, '');
                }
                // Check if parsed value is negative
                const numericValue = parseInt(value);
                if (value !== '' && !isNaN(numericValue) && numericValue < 0) {
                    e.target.value = '';
                }
            });

            // Ensure value stays >= 0 on blur
            input.addEventListener('blur', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value < 0) {
                    e.target.value = '';
                }
            });
        });
    }

    // Search functionality
    function setupMetricSearch(container) {
        const searchInput = container.querySelector('#eval-metric-search');
        const clearBtn = container.querySelector('#eval-search-clear');
        const searchContainer = container.querySelector('.eval-search-container');

        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const metricsContainer = container.querySelector('#metrics-container');
            const cards = metricsContainer.querySelectorAll('.eval-metric-card');

            // Update search container class for clear button visibility
            if (query) {
                searchContainer.classList.add('has-value');
            } else {
                searchContainer.classList.remove('has-value');
            }

            let visibleCount = 0;

            cards.forEach(card => {
                const metricNames = card.dataset.metrics || '';
                const titles = card.querySelectorAll('h4');
                const helpTexts = card.querySelectorAll('.eval-metric-help');

                let matchText = metricNames.toLowerCase();
                titles.forEach(t => matchText += ' ' + t.textContent.toLowerCase());
                helpTexts.forEach(h => matchText += ' ' + h.textContent.toLowerCase());

                if (!query || matchText.includes(query)) {
                    card.classList.remove('hidden-by-search');
                    visibleCount++;
                } else {
                    card.classList.add('hidden-by-search');
                }
            });

            // Show no results message if needed
            let noResults = container.querySelector('.eval-no-results');
            if (visibleCount === 0 && query) {
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.className = 'eval-no-results';
                    noResults.innerHTML = `
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3; margin-bottom: 12px;">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                        <p>No metrics found matching "<strong>${query}</strong>"</p>
                    `;
                    metricsContainer.appendChild(noResults);
                } else {
                    noResults.querySelector('p').innerHTML = `No metrics found matching "<strong>${query}</strong>"`;
                    noResults.style.display = 'block';
                }
            } else if (noResults) {
                noResults.style.display = 'none';
            }
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
        });
    }

    // Toolbar functionality
    function setupToolbar(container) {
        const expandAllBtn = container.querySelector('#expand-all-btn');
        const collapseAllBtn = container.querySelector('#collapse-all-btn');
        const showUnratedBtn = container.querySelector('#show-unrated-btn');

        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                container.querySelectorAll('.eval-metric-card').forEach(card => {
                    card.classList.remove('collapsed');
                });
                container.querySelectorAll('.eval-sub-metric').forEach(subMetric => {
                    subMetric.classList.remove('collapsed');
                });
            });
        }

        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                container.querySelectorAll('.eval-metric-card').forEach(card => {
                    card.classList.add('collapsed');
                });
                container.querySelectorAll('.eval-sub-metric').forEach(subMetric => {
                    subMetric.classList.add('collapsed');
                });
            });
        }

        if (showUnratedBtn) {
            let showOnlyUnrated = false;
            showUnratedBtn.addEventListener('click', () => {
                showOnlyUnrated = !showOnlyUnrated;
                showUnratedBtn.classList.toggle('active', showOnlyUnrated);

                container.querySelectorAll('.eval-metric-card').forEach(card => {
                    if (showOnlyUnrated) {
                        if (card.classList.contains('completed')) {
                            card.style.display = 'none';
                        } else {
                            card.style.display = '';
                        }
                    } else {
                        card.style.display = '';
                    }
                });
            });
        }
    }

    // Update metric card completion status (for "Show Unrated" button)
    function updateMetricCompletionStatus(container) {
        const cards = container.querySelectorAll('#metrics-container .eval-metric-card');

        cards.forEach(card => {
            const hasRating = checkCardHasRating(card);
            if (hasRating) {
                card.classList.add('completed');
            } else {
                card.classList.remove('completed');
            }
        });
    }

    // Check if a metric card has any rating
    // Smart logic: Only count as "rated" if all required fields are filled OR if only optional fields exist
    function checkCardHasRating(card) {
        // Check if there are any required fields without values
        const requiredInputs = card.querySelectorAll('input[required], select[required], textarea[required]');

        for (const input of requiredInputs) {
            if (input.type === 'radio') {
                // For radio buttons, check if any in the group is checked
                const name = input.name;
                const checked = card.querySelector(`input[name="${name}"]:checked`);
                if (!checked) return false;
            } else if (input.type === 'checkbox') {
                if (!input.checked) return false;
            } else if (input.tagName === 'SELECT') {
                if (!input.value || input.value === '') return false;
            } else {
                if (!input.value || input.value.trim() === '') return false;
            }
        }

        // Check for select elements that have "Select an option" as default (these need user action)
        const selects = card.querySelectorAll('select');
        for (const select of selects) {
            // If select has no value and has a disabled placeholder, it needs selection
            const hasPlaceholder = select.querySelector('option[disabled][selected]');
            if (hasPlaceholder && (!select.value || select.value === '')) {
                return false;
            }
        }

        // If we have boolean fields with defaults (false), they're already "rated"
        // If we have number fields with empty (defaulting to 0), they're "rated"
        // If we have text fields empty (defaulting to blank), they're "rated"
        // So if no required fields are missing and no selects need action, it's rated
        return true;
    }
    
    // Check if user has modified ANY input (for confirmation modal)
    function hasUserModifiedAnyInput(container) {
        console.log('[EVAL] 🔍 Checking if user modified any input...');
        
        // Check if any radio button is checked WITH "True" (False is default)
        const anyTrueChecked = container.querySelector('input[type="radio"][value="true"]:checked');
        console.log('[EVAL] 📊 Any "True" radio checked:', !!anyTrueChecked);
        if (anyTrueChecked) return true;
        
        // Check if any number input has a value
        const numberInputs = container.querySelectorAll('input[type="number"]');
        let hasNumberValue = false;
        for (const input of numberInputs) {
            if (input.value && input.value.trim() !== '') {
                hasNumberValue = true;
                break;
            }
        }
        console.log('[EVAL] 📊 Any number input filled:', hasNumberValue);
        if (hasNumberValue) return true;
        
        // Check if any text input has a value
        const textInputs = container.querySelectorAll('input[type="text"], textarea');
        let hasTextValue = false;
        for (const input of textInputs) {
            if (input.value && input.value.trim() !== '') {
                hasTextValue = true;
                break;
            }
        }
        console.log('[EVAL] 📊 Any text input filled:', hasTextValue);
        if (hasTextValue) return true;
        
        // Check if any select has a value (non-default)
        const selects = container.querySelectorAll('select');
        let hasSelectValue = false;
        for (const select of selects) {
            if (select.value && select.value !== '') {
                hasSelectValue = true;
                break;
            }
        }
        console.log('[EVAL] 📊 Any select dropdown selected:', hasSelectValue);
        if (hasSelectValue) return true;
        
        console.log('[EVAL] ✅ Result: User has NOT modified anything - will show confirmation');
        return false; // Nothing modified
    }

    function getMetricHelpText(metric) {
        // Use Description column from the metric if available
        if (metric.Description && metric.Description.trim() !== '') {
            return metric.Description.trim();
        }
        return '';
    }

    function setupKeyboardNavigation(container, overlay) {
        // Setup skip button handlers
        container.querySelectorAll('.eval-skip-link').forEach(skipBtn => {
            skipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const metricName = skipBtn.dataset.skip;
                const metricCard = skipBtn.closest('.eval-metric-card');

                // Uncheck all radio buttons for this metric
                container.querySelectorAll(`input[name="${metricName}"]`).forEach(radio => {
                    radio.checked = false;
                });

                // Toggle skip button active state for this metric only
                metricCard.querySelectorAll('.eval-skip-link').forEach(btn => {
                    btn.classList.remove('active');
                });
                skipBtn.classList.add('active');
            });
        });

        // Clear skip state when True/False is selected
        container.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const metricCard = e.target.closest('.eval-metric-card');
                if (metricCard) {
                    const skipBtn = metricCard.querySelector('.eval-skip-link');
                    if (skipBtn) {
                        skipBtn.classList.remove('active');
                    }
                }
            });
        });

        // Keyboard shortcuts
        container.addEventListener('keydown', (e) => {
            const activeCard = document.activeElement.closest('.eval-metric-card');
            if (!activeCard) return;

            const metricName = activeCard.dataset.metric;
            const trueBtn = activeCard.querySelector('label[data-key="T"] input');
            const falseBtn = activeCard.querySelector('label[data-key="F"] input');
            const skipBtn = activeCard.querySelector('.eval-skip-link');

            // Don't interfere with typing in inputs
            if (e.target.tagName === 'INPUT' && e.target.type !== 'radio') return;

            switch(e.key.toLowerCase()) {
                case 't':
                    if (trueBtn && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        trueBtn.click();
                    }
                    break;
                case 'f':
                    if (falseBtn && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        falseBtn.click();
                    }
                    break;
                case 's':
                    if (skipBtn && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        skipBtn.click();
                    }
                    break;
            }
        });

        // Global keyboard shortcuts for modal
        overlay.addEventListener('keydown', (e) => {
            // ESC to close
            if (e.key === 'Escape') {
                overlay.querySelector('.eval-modal-close').click();
            }
            // Enter to submit (when not in input)
            if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const submitBtn = overlay.querySelector('#eval-submit-btn');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                }
            }
        });
    }

    // Render template-based metric (new approach)
    function renderTemplateBasedMetric(template, metricNames) {
        // metricNames can be a single string or an array
        const namesArray = Array.isArray(metricNames) ? metricNames : [metricNames];
        // Use first metric name for input names (they all share the same inputs)
        const primaryMetricName = namesArray[0];

        let html = '';

        // Iterate through each sub-field (e.g., ProcessCompleteProfile, PaymentsTool)
        for (const [subFieldName, fields] of Object.entries(template)) {
            html += `
                <div class="eval-sub-metric collapsed" data-submetric="${subFieldName}">
                    <div class="eval-sub-metric-header">
                        <h5>${subFieldName}</h5>
                        <svg class="eval-sub-metric-expand-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                        </svg>
                    </div>
                    <div class="eval-sub-metric-content">
                        <div class="eval-sub-field-inputs">
            `;

            // Iterate through each property of the sub-field
            for (const [fieldName, fieldTypeStr] of Object.entries(fields)) {
                const inputName = `${primaryMetricName}.${subFieldName}.${fieldName}`;

                // Determine actual type (handle List [options])
                let fieldType = fieldTypeStr;
                let listOptions = [];

                if (fieldTypeStr && typeof fieldTypeStr === 'string' && fieldTypeStr.startsWith('List [')) {
                    fieldType = 'List';
                    const content = fieldTypeStr.substring(6, fieldTypeStr.length - 1);
                    listOptions = content.split(',').map(opt => opt.trim()).filter(opt => opt);
                }

                const isRequired = false; // No fields are required
                html += `<div class="eval-field-group">`;
                html += `<label class="eval-field-label">${fieldName}${isRequired ? ' <span style="color: var(--eval-orange);">*</span>' : ''}</label>`;

                switch (fieldType) {
                    case 'Boolean':
                        html += `
                            <div class="eval-rating-options">
                                <label class="eval-checkbox-label">
                                    <input type="radio" name="${inputName}" value="true">
                                    <span>True</span>
                                </label>
                                <label class="eval-checkbox-label">
                                    <input type="radio" name="${inputName}" value="false" checked>
                                    <span>False</span>
                                </label>
                            </div>
                        `;
                        break;

                    case 'Count':
                        html += `
                            <input type="number"
                                   name="${inputName}"
                                   placeholder="Leave empty for 0"
                                   min="0"
                                   step="1">
                        `;
                        break;

                    case 'Text':
                        html += `
                            <input type="text"
                                   name="${inputName}"
                                   placeholder="Leave empty for blank">
                        `;
                        break;

                    case 'List':
                        if (listOptions.length > 0) {
                            html += `
                                <select name="${inputName}" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--eval-border); border-radius: 4px; color: var(--eval-text-primary);">
                                    <option value="" disabled selected>Select an option</option>
                                    ${listOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                                </select>
                            `;
                        } else {
                            html += `
                                <textarea name="${inputName}"
                                          rows="3"
                                          placeholder="Leave empty if not applicable"></textarea>
                            `;
                        }
                        break;
                }

                html += `</div>`;
            }

            html += `
                        </div>
                    </div>
                </div>
            `;
        }

        return html;
    }

    // Legacy render function for backward compatibility
    function renderLegacyMetricInput(metric, camelCaseName) {
        // If no Type field exists, show message
        if (!metric.Type) {
            return `
                <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;">
                    <p style="color: var(--eval-warning); margin: 0; font-size: 13px;">
                        This metric doesn't have a template defined. Please add a template using the "Add Metric" tab.
                    </p>
                </div>
            `;
        }

        switch (metric.Type.toLowerCase()) {
            case 'boolean':
                return `
                    <div class="eval-rating-group">
                        <div class="eval-rating-options">
                            <label class="eval-checkbox-label" data-key="T">
                                <input type="radio" name="${camelCaseName}" value="true">
                                <span>True<span class="eval-keyboard-hint">(T)</span></span>
                            </label>
                            <label class="eval-checkbox-label" data-key="F">
                                <input type="radio" name="${camelCaseName}" value="false" checked>
                                <span>False<span class="eval-keyboard-hint">(F)</span></span>
                            </label>
                        </div>
                        <button type="button" class="eval-skip-link" data-skip="${camelCaseName}" data-key="S">
                            Skip<span class="eval-keyboard-hint">(S)</span>
                        </button>
                    </div>
                `;

            case 'count':
                return `
                    <input type="number"
                           name="${camelCaseName}"
                           placeholder="Enter a number (leave empty to skip)"
                           min="0"
                           step="1">
                `;

            case 'list':
                const values = metric.Values ? metric.Values.split(',').map(v => v.trim()) : [];
                return `
                    <div class="eval-multiselect" data-metric="${camelCaseName}">
                        ${values.map(value => `
                            <label class="eval-multiselect-option">
                                <input type="checkbox" name="${camelCaseName}" value="${value}">
                                <span>${value}</span>
                            </label>
                        `).join('')}
                    </div>
                `;

            default:
                return `
                    <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;">
                        <p style="color: var(--eval-warning); margin: 0; font-size: 13px;">
                            Unknown metric type: ${metric.Type}
                        </p>
                    </div>
                `;
        }
    }

    // View Metrics Tab (Read-only)
    function renderViewMetricsTab(overlay) {
        const container = overlay.querySelector('#eval-view-tab');
        const metrics = getMetricsForSkill();
        const canEdit = hasPermissionToAddMetric();

        if (metrics.length === 0) {
            container.innerHTML = `
                <div class="eval-no-metrics">
                    <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style="margin-bottom: 16px;">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <p>No metrics available for this skill</p>
                </div>
            `;
            return;
        }

        // Group metrics by template
        const templateGroups = new Map();

        metrics.forEach(metric => {
            const templateKey = metric.Template || `legacy_${metric.Definition}`;

            if (!templateGroups.has(templateKey)) {
                templateGroups.set(templateKey, []);
            }
            templateGroups.get(templateKey).push(metric);
        });

        let html = `
            <!-- Search Bar for View Tab -->
            <div class="eval-search-container" style="margin-bottom: 16px;">
                <svg class="eval-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input type="text" class="eval-search-input" placeholder="Search metrics..." id="eval-view-metric-search">
                <button class="eval-search-clear" id="eval-view-search-clear" title="Clear search">×</button>
            </div>

            <div style="padding: 0 0 16px 0;">
                <div class="eval-note" style="padding: 12px; background: rgba(255, 107, 53, 0.1); border-left: 3px solid var(--eval-orange); border-radius: 4px;">
                    <p style="margin: 0; color: var(--eval-text-secondary); font-size: 14px;">
                        Read-only view of <strong>${templateGroups.size}</strong> metric cards for <strong>${currentSkill}</strong> skill.${canEdit ? ' Click Edit to modify.' : ''}
                    </p>
                </div>
            </div>
            <div id="view-metrics-container">
        `;
        let cardIndex = 0; // Track card count
        const totalCards = templateGroups.size; // Total number of cards

        templateGroups.forEach((groupedMetrics, templateKey) => {
            cardIndex++; // Increment for each card
            
            const firstMetric = groupedMetrics[0];
            const metricNames = groupedMetrics.map(m => m.Definition);
            const metricDescriptions = groupedMetrics.map(m => getMetricHelpText(m)).filter(d => d);
            const metricSkills = firstMetric.Skills || '';
            const isEnabled = firstMetric.Enabled !== 'FALSE' && firstMetric.Enabled !== false;

            // Badge text - just show card number
            const badgeText = `Metric ${cardIndex}/${totalCards}`;

            let template = null;
            if (firstMetric.Template) {
                try {
                    template = JSON.parse(firstMetric.Template);
                } catch (e) {
                    console.error('Failed to parse template:', e);
                }
            }

            // Store metric data for edit
            const metricData = encodeURIComponent(JSON.stringify({
                definitions: metricNames.join(', '),
                descriptions: metricDescriptions.join(', '),
                template: firstMetric.Template || '',
                skills: metricSkills,
                enabled: isEnabled
            }));

            html += `
                <div class="eval-metric-card collapsed" style="opacity: 0.9;" data-metric-info="${metricData}">
                    <div class="eval-metric-card-header">
                        <div style="flex: 1;">
                            <div class="eval-metric-badge">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                                <span>${badgeText}</span>
                            </div>
                            ${metricNames.map((name, idx) => `
                                <h4 style="${idx > 0 ? 'margin-top: 8px;' : ''}">${name}</h4>
                                ${metricDescriptions[idx] ? `<div class="eval-metric-help">${metricDescriptions[idx]}</div>` : ''}
                            `).join('')}
                        </div>
                        ${canEdit ? `<button class="eval-metric-edit-btn" type="button">Edit</button>` : ''}
                        <svg class="eval-expand-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                        </svg>
                    </div>
                    <div class="eval-metric-input-group">
                        ${template ? renderViewTemplateBasedMetric(template) : renderViewLegacyMetric(firstMetric)}
                    </div>
                </div>
            `;
        });

        html += '</div>'; // Close view-metrics-container
        container.innerHTML = html;

        // Setup search functionality for View tab
        setupViewMetricSearch(container);

        // Setup collapsible metric cards
        container.querySelectorAll('.eval-metric-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                const card = header.closest('.eval-metric-card');
                card.classList.toggle('collapsed');
            });
        });

        // Setup collapsible sub-metrics in View Metrics tab
        container.querySelectorAll('.eval-sub-metric-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent parent card from toggling
                const subMetric = header.closest('.eval-sub-metric');
                subMetric.classList.toggle('collapsed');
            });
        });

        // Setup edit buttons
        if (canEdit) {
            container.querySelectorAll('.eval-metric-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const card = btn.closest('.eval-metric-card');
                    toggleEditMode(card, overlay);
                });
            });
        }
    }

    // Search functionality for View Metrics tab
    function setupViewMetricSearch(container) {
        const searchInput = container.querySelector('#eval-view-metric-search');
        const clearBtn = container.querySelector('#eval-view-search-clear');
        const searchContainer = container.querySelector('.eval-search-container');

        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const metricsContainer = container.querySelector('#view-metrics-container');
            const cards = metricsContainer.querySelectorAll('.eval-metric-card');

            // Update search container class for clear button visibility
            if (query) {
                searchContainer.classList.add('has-value');
            } else {
                searchContainer.classList.remove('has-value');
            }

            let visibleCount = 0;

            cards.forEach(card => {
                const titles = card.querySelectorAll('h4');
                const helpTexts = card.querySelectorAll('.eval-metric-help');

                let matchText = '';
                titles.forEach(t => matchText += ' ' + t.textContent.toLowerCase());
                helpTexts.forEach(h => matchText += ' ' + h.textContent.toLowerCase());

                if (!query || matchText.includes(query)) {
                    card.classList.remove('hidden-by-search');
                    visibleCount++;
                } else {
                    card.classList.add('hidden-by-search');
                }
            });

            // Show no results message if needed
            let noResults = container.querySelector('.eval-no-results');
            if (visibleCount === 0 && query) {
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.className = 'eval-no-results';
                    noResults.innerHTML = `
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.3; margin-bottom: 12px;">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                        <p>No metrics found matching "<strong>${query}</strong>"</p>
                    `;
                    metricsContainer.appendChild(noResults);
                } else {
                    noResults.querySelector('p').innerHTML = `No metrics found matching "<strong>${query}</strong>"`;
                    noResults.style.display = 'block';
                }
            } else if (noResults) {
                noResults.style.display = 'none';
            }
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
        });
    }

    function toggleEditMode(card, overlay) {
        const inputGroup = card.querySelector('.eval-metric-input-group');
        const editBtn = card.querySelector('.eval-metric-edit-btn');
        const existingControls = card.querySelector('.eval-edit-controls');

        if (existingControls) {
            // Exit edit mode
            existingControls.remove();
            editBtn.textContent = 'Edit';
            return;
        }

        // Enter edit mode
        const metricInfo = JSON.parse(decodeURIComponent(card.dataset.metricInfo));
        const isEnabled = metricInfo.enabled;

        const controls = document.createElement('div');
        controls.className = 'eval-edit-controls';
        controls.innerHTML = `
            <div class="eval-toggle-container">
                <span class="eval-toggle-label">Enabled:</span>
                <div class="eval-toggle ${isEnabled ? 'active' : ''}" data-enabled="${isEnabled}"></div>
                <span style="color: var(--eval-text-muted); font-size: 13px;">${isEnabled ? 'Yes' : 'No'}</span>
            </div>
            <div style="margin-left: auto; display: flex; gap: 8px;">
                <button class="eval-cancel-edit-btn" type="button">Cancel</button>
                <button class="eval-save-btn" type="button">Save</button>
            </div>
        `;

        // Insert at the top of inputGroup for better visibility
        inputGroup.insertBefore(controls, inputGroup.firstChild);
        editBtn.textContent = 'Editing...';

        // Toggle handler
        const toggle = controls.querySelector('.eval-toggle');
        const statusText = toggle.nextElementSibling;
        toggle.addEventListener('click', () => {
            const newState = toggle.dataset.enabled !== 'true';
            toggle.dataset.enabled = newState;
            toggle.classList.toggle('active', newState);
            statusText.textContent = newState ? 'Yes' : 'No';
        });

        // Cancel handler
        controls.querySelector('.eval-cancel-edit-btn').addEventListener('click', () => {
            controls.remove();
            editBtn.textContent = 'Edit';
        });

        // Save handler
        controls.querySelector('.eval-save-btn').addEventListener('click', async () => {
            const saveBtn = controls.querySelector('.eval-save-btn');
            const newEnabled = toggle.dataset.enabled === 'true';
            await saveMetricUpdate(card, metricInfo, newEnabled, overlay, saveBtn);
        });
    }

    async function saveMetricUpdate(card, metricInfo, newEnabled, overlay, saveBtn) {
        const viewTab = overlay.querySelector('#eval-view-tab');

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const payload = {
            timestamp: new Date().toISOString(),
            metrics: [{
                definition: metricInfo.definitions,
                description: metricInfo.descriptions,
                template: metricInfo.template,
                enabled: newEnabled ? "TRUE" : "FALSE",
                skills: metricInfo.skills.split(',').map(s => s.trim()).filter(s => s)
            }]
        };

        try {
            const response = await sendWebhook(ADD_METRIC_WEBHOOK, payload);
            const successMessage = response.description || 'Metric updated successfully!';

            // Exit edit mode
            const editControls = card.querySelector('.eval-edit-controls');
            if (editControls) editControls.remove();
            const editBtn = card.querySelector('.eval-metric-edit-btn');
            if (editBtn) editBtn.textContent = 'Edit';

            // Update stored data
            metricInfo.enabled = newEnabled;
            card.dataset.metricInfo = encodeURIComponent(JSON.stringify(metricInfo));

            showAlert(viewTab, 'success', successMessage);

            // Refresh data
            await loadAllSheets();
        } catch (error) {
            showAlert(viewTab, 'error', error.message || 'Failed to update metric');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    }

    function renderViewTemplateBasedMetric(template) {
        let html = '';

        for (const [subFieldName, fields] of Object.entries(template)) {
            html += `
                <div class="eval-sub-metric collapsed" data-submetric="${subFieldName}">
                    <div class="eval-sub-metric-header">
                        <h5>${subFieldName}</h5>
                        <svg class="eval-sub-metric-expand-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                        </svg>
                    </div>
                    <div class="eval-sub-metric-content">
                        <div class="eval-sub-field-inputs">
            `;

            for (const [fieldName, fieldType] of Object.entries(fields)) {
                html += `
                    <div class="eval-field-group" style="opacity: 0.8;">
                        <label class="eval-field-label" style="color: var(--eval-text-secondary);">${fieldName}</label>
                        <div style="padding: 8px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: var(--eval-text-muted); font-size: 13px;">
                            Type: ${fieldType}
                        </div>
                    </div>
                `;
            }

            html += `
                        </div>
                    </div>
                </div>
            `;
        }

        return html;
    }

    function renderViewLegacyMetric(metric) {
        if (!metric.Type) {
            return `
                <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;">
                    <p style="color: var(--eval-warning); margin: 0; font-size: 13px;">
                        This metric doesn't have a template defined.
                    </p>
                </div>
            `;
        }

        return `
            <div style="padding: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px;">
                <div style="color: var(--eval-text-secondary); font-size: 13px; margin-bottom: 8px;">Metric Type:</div>
                <div style="color: var(--eval-text-primary); font-size: 14px; font-weight: 500;">${metric.Type}</div>
            </div>
        `;
    }

    // Add Metric Tab
    let metricForms = [];

    // JSON cleaning and processing functions
    function cleanJsonInput(rawJson) {
        let cleaned = rawJson.trim();

        console.log('=== JSON Cleaning Steps ===');
        console.log('Original length:', cleaned.length);
        console.log('First 100 chars:', cleaned.substring(0, 100));

        // Step 1: Try parsing as-is (might be valid JSON already)
        try {
            const directParse = JSON.parse(cleaned);
            console.log('✓ Direct parse successful - valid JSON as-is');
            if (directParse.chatId) {
                delete directParse.chatId;
                console.log('✓ Removed chatId field');
            }
            return directParse;
        } catch (directParseError) {
            console.log('→ Direct parse failed:', directParseError.message);
            console.log('→ Applying cleaning transformations...');
        }

        // Step 2: Normalize newlines for multiline strings
        cleaned = cleaned.replace(/[\r\n]+/g, ' ');
        console.log('After newline normalization');

        // Step 3: Try parsing again after newline fix
        try {
            const afterNewlineParse = JSON.parse(cleaned);
            console.log('✓ Parse successful after newline fix');
            if (afterNewlineParse.chatId) {
                delete afterNewlineParse.chatId;
            }
            return afterNewlineParse;
        } catch (e) {
            console.log('→ Still failing, trying advanced cleaning...');
        }

        // Step 4: Handle Google Sheets format with backslash escapes
        if (cleaned.startsWith('"') && cleaned.includes('\\"')) {
            console.log('→ Detected: Sheets format with backslash escapes');
            if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                cleaned = cleaned.substring(1, cleaned.length - 1);
            }
            cleaned = cleaned.replace(/\\"/g, '"');
            cleaned = cleaned.replace(/\\n/g, ' ');
        }
        // Step 5: Handle Google Sheets format with double quotes (but only if wrapped)
        else if (cleaned.startsWith('""') && cleaned.endsWith('""')) {
            console.log('→ Detected: Sheets format with double quotes wrapper');
            // Remove outer quotes
            cleaned = cleaned.substring(1, cleaned.length - 1);
            // Unescape double quotes: "" -> "
            cleaned = cleaned.replace(/""/g, '"');
        }

        // Step 6: Remove markdown code blocks
        cleaned = cleaned.replace(/^```json\s*/i, '');
        cleaned = cleaned.replace(/```\s*$/i, '');
        cleaned = cleaned.trim();

        // Step 7: Remove outer array brackets [ ]
        cleaned = cleaned.replace(/^\[\s*/, '');
        cleaned = cleaned.replace(/\s*\]\s*$/, '');
        cleaned = cleaned.trim();

        // Step 8: Remove trailing quotes that aren't part of JSON structure
        while (cleaned.endsWith('"') && !cleaned.endsWith('}"') && !cleaned.endsWith('""')) {
            cleaned = cleaned.substring(0, cleaned.length - 1).trim();
        }

        console.log('Final cleaned length:', cleaned.length);
        console.log('Final first 200 chars:', cleaned.substring(0, 200));

        // Step 9: Final parse attempt
        let parsed;
        try {
            parsed = JSON.parse(cleaned);
            console.log('✓ JSON parsed successfully after cleaning');
        } catch (e) {
            console.error('Parse failed after all cleaning:', e.message);
            console.log('Failed content:', cleaned);
            throw e;
        }

        // Step 10: Remove chatId field if it exists
        if (parsed.chatId) {
            delete parsed.chatId;
            console.log('✓ Removed chatId field');
        }

        console.log('=== Cleaning Complete ===');
        return parsed;
    }

    function getTypeFromValue(value) {
        if (typeof value === 'string') {
            if (value.trim().match(/^List\s*\[.*\]$/i)) {
                return value.trim();
            }
            if (['Boolean', 'Text', 'Count', 'List'].includes(value)) {
                return value;
            }
            // Default string values to List type for business flexibility
            return 'List';
        }
        if (typeof value === 'boolean') return 'Boolean';
        if (typeof value === 'number') return 'Count';
        if (Array.isArray(value)) {
            return `List [${value.join(', ')}]`;
        }
        return 'List';
    }

    function analyzeJsonStructure(jsonObject) {
        const result = {
            isComplex: false,
            structure: {}
        };

        let hasNestedObjects = false;
        for (const value of Object.values(jsonObject)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                hasNestedObjects = true;
                break;
            }
        }

        result.isComplex = hasNestedObjects;

        if (result.isComplex) {
            for (const [key, value] of Object.entries(jsonObject)) {
                result.structure[key] = {};
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    for (const [propKey, propValue] of Object.entries(value)) {
                        result.structure[key][propKey] = getTypeFromValue(propValue);
                    }
                } else {
                    if (!result.structure['General']) result.structure['General'] = {};
                    result.structure['General'][key] = getTypeFromValue(value);
                }
            }
            if (result.structure['General'] && Object.keys(result.structure['General']).length === 0) {
                delete result.structure['General'];
            }
        } else {
            for (const [key, value] of Object.entries(jsonObject)) {
                result.structure[key] = getTypeFromValue(value);
            }
        }

        return result;
    }

    function deduceStructure(jsonObject) {
        // Deprecated, use analyzeJsonStructure
        return analyzeJsonStructure(jsonObject).structure;
    }

    function renderAddTab(overlay) {
        const container = overlay.querySelector('#eval-add-tab');

        container.innerHTML = `
            <!-- Header Info -->
            <div class="eval-note" style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, rgba(255, 167, 53, 0.1) 0%, rgba(255, 167, 53, 0.05) 100%); border: 1px solid rgba(255, 167, 53, 0.2); border-radius: 8px;">
                <div style="display: flex; align-items: start; gap: 12px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <div>
                        <h4 style="margin: 0 0 6px 0; color: var(--eval-orange); font-size: 14px; font-weight: 600;">Create New Evaluation Metric</h4>
                        <p style="margin: 0; color: var(--eval-text-secondary); font-size: 13px; line-height: 1.6;">
                            Follow the 3-step process below. After filling the form, click "Process Metric(s)" to preview, then "Submit" to add to the system.
                        </p>
                    </div>
                </div>
            </div>
            
            <div id="metric-forms-container"></div>
            <div class="eval-btn-group" id="add-tab-buttons">
                <button class="eval-add-metric-btn" id="add-another-metric">
                    <span>+ Add Another Metric Form</span>
                </button>
            </div>

            <div id="eval-process-preview" class="eval-process-container" style="display: none;">
                <!-- Preview content will be injected here -->
            </div>
        `;

        metricForms = [];
        addMetricForm(container);

        container.querySelector('#add-another-metric').addEventListener('click', () => {
            addMetricForm(container);
        });
    }

    function addMetricForm(container) {
        const formId = `metric-form-${Date.now()}`;
        metricForms.push(formId);

        const formsContainer = container.querySelector('#metric-forms-container');
        const formCard = document.createElement('div');
        formCard.className = 'eval-metric-form-card';
        formCard.id = formId;
        formCard.innerHTML = `
            ${metricForms.length > 1 ? `<button class="eval-remove-metric-form" data-form="${formId}">×</button>` : ''}
            
            <!-- Step 1: Define Metrics -->
            <div class="eval-form-group">
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="background: var(--eval-orange); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">1</span>
                    <span style="font-size: 15px; font-weight: 600;">Define Metric(s)</span>
                    <small style="color: var(--eval-text-muted); font-weight: normal;">(Required)</small>
                </label>
                <div class="eval-note" style="margin-bottom: 12px; padding: 10px; background: rgba(16, 185, 129, 0.08); border-left: 3px solid var(--eval-success); border-radius: 4px;">
                    <p style="margin: 0; color: var(--eval-text-secondary); font-size: 13px; line-height: 1.5;">
                        <strong>Multiple metrics in this form:</strong> You can add several metrics that share the <strong>same output format/template</strong>. For example, "wrongToolCalled" and "requiredToolMissing" might both track tool usage errors with the same structure.
                    </p>
                </div>
                <table class="eval-config-table metric-pairs-table">
                    <thead>
                        <tr>
                            <th style="width: 40%">Metric Name</th>
                            <th style="width: 50%">Description (Optional)</th>
                            <th style="width: 10%">Action</th>
                        </tr>
                    </thead>
                    <tbody class="metric-pairs-container">
                        <tr class="metric-pair-row">
                            <td><input type="text" class="metric-pair-name" placeholder="e.g., wrongToolsCalled"></td>
                            <td><input type="text" class="metric-pair-desc" placeholder="e.g., Did the bot use wrong tools?"></td>
                            <td style="text-align: center;">
                                <button class="eval-action-btn delete-metric-row" type="button" title="Delete Row">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <button class="eval-btn eval-btn-secondary add-metric-row-btn" type="button" style="width: 100%; padding: 10px; border-style: dashed; margin-top: 8px; font-weight: 500;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    Add Another Metric
                </button>
            </div>
            
            <!-- Step 2: Template JSON -->
            <div class="eval-form-group">
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="background: var(--eval-orange); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">2</span>
                    <span style="font-size: 15px; font-weight: 600;">Template JSON</span>
                    <small style="color: var(--eval-text-muted); font-weight: normal;">(Required)</small>
                </label>
                <div class="eval-note" style="margin-bottom: 12px; padding: 10px; background: rgba(59, 130, 246, 0.08); border-left: 3px solid #3B82F6; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0; color: var(--eval-text-secondary); font-size: 13px; line-height: 1.5;">
                        Paste a JSON template with <strong>actual values</strong>. The system will analyze the structure and field types.
                    </p>
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: var(--eval-orange); font-weight: 500; font-size: 13px;">Show Example</summary>
                        <pre style="margin: 8px 0 0 0; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; font-size: 12px; overflow-x: auto; color: var(--eval-text-secondary);">{
  "Request_Service": {
    "Supposed_To_Be_Called": true,
    "numberTimes_Supposed_To_Be_Called": 2
  }
}</pre>
                    </details>
                </div>
                <textarea class="metric-template-json" rows="10" placeholder="Paste your JSON template here..." required></textarea>
            </div>
            
            <!-- Step 3: Select Skills -->
            <div class="eval-form-group">
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="background: var(--eval-orange); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">3</span>
                    <span style="font-size: 15px; font-weight: 600;">Select Target Skills</span>
                    <small style="color: var(--eval-text-muted); font-weight: normal;">(Required)</small>
                </label>
                <div class="eval-note" style="margin-bottom: 12px; padding: 10px; background: rgba(139, 92, 246, 0.08); border-left: 3px solid #8B5CF6; border-radius: 4px;">
                    <p style="margin: 0; color: var(--eval-text-secondary); font-size: 13px; line-height: 1.5;">
                        Choose which skills this metric applies to. Check "Select All" for universal metrics.
                    </p>
                </div>
                <div style="background: var(--eval-card-bg); border: 1.5px solid var(--eval-border); border-radius: 8px; padding: 16px;">
                    <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                        <label class="eval-skill-checkbox" style="background: rgba(255, 167, 53, 0.08); padding: 12px; border-radius: 6px; margin: 0; border: 1px solid rgba(255, 167, 53, 0.2);">
                            <input type="checkbox" class="skill-all" data-form="${formId}">
                            <span style="font-weight: 600; color: var(--eval-orange);">
                                Select All Skills
                            </span>
                        </label>
                    </div>
                    <div class="eval-skills-selector" style="max-height: 180px; overflow-y: auto; border: none; padding: 0;">
                        ${getAllSkills().map(skill => `
                            <label class="eval-skill-checkbox">
                                <input type="checkbox" class="skill-checkbox" value="${skill}">
                                <span>${skill}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        formsContainer.appendChild(formCard);

        // Event listeners for this form
        const skillAllCheckbox = formCard.querySelector('.skill-all');
        const skillCheckboxes = formCard.querySelectorAll('.skill-checkbox');

        // Select All functionality
        skillAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            skillCheckboxes.forEach(cb => {
                cb.checked = isChecked;
            });
        });

        // Update Select All when individual checkboxes change
        skillCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const allChecked = Array.from(skillCheckboxes).every(cb => cb.checked);
                const noneChecked = Array.from(skillCheckboxes).every(cb => !cb.checked);
                
                if (allChecked) {
                    skillAllCheckbox.checked = true;
                    skillAllCheckbox.indeterminate = false;
                } else if (noneChecked) {
                    skillAllCheckbox.checked = false;
                    skillAllCheckbox.indeterminate = false;
                } else {
                    skillAllCheckbox.checked = false;
                    skillAllCheckbox.indeterminate = true;
                }
            });
        });

        // Metric Pairs Table Handlers
        const metricPairsTable = formCard.querySelector('.metric-pairs-container');
        const addRowBtn = formCard.querySelector('.add-metric-row-btn');

        // Add new metric row
        addRowBtn.addEventListener('click', () => {
            const newRow = document.createElement('tr');
            newRow.className = 'metric-pair-row';
            newRow.innerHTML = `
                <td><input type="text" class="metric-pair-name" placeholder="e.g., wrongToolsCalled"></td>
                <td><input type="text" class="metric-pair-desc" placeholder="e.g., Did the bot use wrong tools?"></td>
                <td style="text-align: center;">
                    <button class="eval-action-btn delete-metric-row" type="button" title="Delete Row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </td>
            `;
            metricPairsTable.appendChild(newRow);
        });

        // Delete metric row (event delegation)
        formCard.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-metric-row');
            if (deleteBtn) {
                const row = deleteBtn.closest('.metric-pair-row');
                const tbody = row.closest('tbody');
                // Keep at least one row
                if (tbody.querySelectorAll('.metric-pair-row').length > 1) {
                    row.remove();
                } else {
                    showAlert(addTab, 'error', 'At least one metric is required');
                }
            }
        });

        if (metricForms.length > 1) {
            formCard.querySelector('.eval-remove-metric-form').addEventListener('click', (e) => {
                const formToRemove = e.target.dataset.form;
                metricForms = metricForms.filter(id => id !== formToRemove);
                document.getElementById(formToRemove).remove();
            });
        }
    }

    function addListItem(container, value) {
        const item = document.createElement('div');
        item.className = 'eval-list-item';
        item.innerHTML = `
            <span>${value}</span>
            <button class="eval-list-item-remove" type="button">×</button>
        `;

        item.querySelector('.eval-list-item-remove').addEventListener('click', () => {
            item.remove();
        });

        container.appendChild(item);
    }

    // Submit Handling
    function setupSubmitButton(overlay) {
        const submitBtn = overlay.querySelector('#eval-submit-btn');

        submitBtn.addEventListener('click', async () => {
            // Check active tab dynamically on each click
            const activeTab = overlay.querySelector('.eval-tab.active').dataset.tab;

            if (activeTab === 'rate') {
                await handleRateSubmit(overlay, submitBtn);
            } else if (activeTab === 'add') {
                const processPreview = overlay.querySelector('#eval-process-preview');
                // If preview is hidden, we are in "Process" mode
                if (!processPreview || processPreview.style.display === 'none') {
                    await processMetrics(overlay);
                } else {
                    // Preview is visible, we are in "Submit" mode
                    await finalizeAndSubmitMetrics(overlay, submitBtn);
                }
            }
        });
    }

    // Group metrics with identical rating objects
    function groupIdenticalRatings(ratings) {
        if (ratings.length === 0) return ratings;

        // Create a map: stringified value -> array of metric names
        const valueToMetrics = new Map();

        ratings.forEach(ratingObj => {
            // Each rating object has one key (the metric name) and its value
            const metricName = Object.keys(ratingObj)[0];
            const metricValue = ratingObj[metricName];

            // Stringify the value for comparison
            const valueStr = JSON.stringify(metricValue);

            if (!valueToMetrics.has(valueStr)) {
                valueToMetrics.set(valueStr, []);
            }
            valueToMetrics.get(valueStr).push(metricName);
        });

        // Build grouped result - split comma-separated metrics into separate objects
        const groupedRatings = [];

        valueToMetrics.forEach((metricNames, valueStr) => {
            const value = JSON.parse(valueStr);

            // For each metric name, create a separate rating object
            metricNames.forEach(metricName => {
                const ratingObj = {};
                ratingObj[metricName] = value;
                groupedRatings.push(ratingObj);
            });
        });

        console.log('=== Grouped Ratings ===');
        console.log('Original count:', ratings.length);
        console.log('Grouped count:', groupedRatings.length);
        console.log('Grouped result:', JSON.stringify(groupedRatings, null, 2));

        return groupedRatings;
    }

    async function handleRateSubmit(overlay, submitBtn) {
        const rateTab = overlay.querySelector('#eval-rate-tab');
        const footer = overlay.querySelector('.eval-modal-footer');
        
        console.log('[EVAL] 🚀 ========================================');
        console.log('[EVAL] 🚀 Submit button clicked - starting validation');
        console.log('[EVAL] 🚀 ========================================');
        
        // Check if user has modified any input
        const userModified = hasUserModifiedAnyInput(rateTab);
        console.log('[EVAL] 📊 hasUserModifiedAnyInput result:', userModified);
        
        if (!userModified) {
            console.log('[EVAL] ⚠️ No modifications detected - showing confirmation modal...');
            // Show confirmation modal
            const shouldProceed = await showDefaultValuesConfirmation();
            console.log('[EVAL] 📊 User confirmation result:', shouldProceed ? 'Proceed' : 'Cancelled');
            if (!shouldProceed) {
                console.log('[EVAL] ❌ User cancelled - aborting submission');
                return; // User cancelled
            }
            console.log('[EVAL] ✅ User confirmed - proceeding with defaults');
        } else {
            console.log('[EVAL] ✅ User has modified inputs - skipping confirmation modal');
        }
        
        const ratings = [];
        let hasAtLeastOne = false;

        // Remove any existing error message
        const existingError = footer.querySelector('.eval-error-message');
        if (existingError) existingError.remove();

        // Collect all ratings from UI cards
        const metricCards = rateTab.querySelectorAll('.eval-metric-card');
        let userStartedFilling = false;
        let hasIncompleteMetric = false;

        metricCards.forEach(card => {
            // Get all metric names for this card (could be multiple if grouped)
            const metricsAttr = card.dataset.metrics;
            if (!metricsAttr) return;

            const camelCaseNames = metricsAttr.split(',').map(n => n.trim());
            const primaryMetricName = camelCaseNames[0];

            console.log(`Processing card with metrics: ${camelCaseNames.join(', ')}`);

            // Find the template for this metric
            const metrics = getMetricsForSkill();
            const metricWithTemplate = metrics.find(m =>
                camelCaseNames.includes(toCamelCase(m.Definition))
            );

            if (!metricWithTemplate) return;

            // Check if metric has a template
            let template = null;
            if (metricWithTemplate.Template) {
                try {
                    template = JSON.parse(metricWithTemplate.Template);
                } catch (e) {
                    console.error('Failed to parse template:', e);
                }
            }

            if (template) {
                // Template-based metric - collect nested structure
                const metricData = {};
                const totalSubMetrics = Object.keys(template).length;
                let filledSubMetrics = 0;

                for (const [subFieldName, fields] of Object.entries(template)) {
                    const subFieldData = {};
                    let hasBooleanValue = false;

                    // Check if this sub-metric has a boolean field
                    const hasBooleanField = Object.values(fields).includes('Boolean');

                    for (const [fieldName, fieldType] of Object.entries(fields)) {
                        const inputName = `${primaryMetricName}.${subFieldName}.${fieldName}`;

                        if (fieldType === 'Boolean') {
                            const selected = rateTab.querySelector(`input[name="${inputName}"]:checked`);
                            if (selected) {
                                subFieldData[fieldName] = selected.value === 'true';
                                hasBooleanValue = true;
                                userStartedFilling = true;
                            }
                        } else if (fieldType === 'Count') {
                            const input = rateTab.querySelector(`input[name="${inputName}"]`);
                            if (input && input.value.trim() !== '') {
                                const countValue = parseInt(input.value);
                                if (countValue < 0) {
                                    // Mark as error but continue collecting
                                    hasIncompleteMetric = true;
                                    continue;
                                }
                                subFieldData[fieldName] = countValue;
                                userStartedFilling = true;
                            } else if (hasBooleanValue) {
                                // Default to 0 if count field exists but not filled
                                subFieldData[fieldName] = 0;
                                console.log(`ℹ Count field "${fieldName}" in "${subFieldName}" defaulted to 0`);
                            }
                        } else if (fieldType === 'Text') {
                            const input = rateTab.querySelector(`input[name="${inputName}"], textarea[name="${inputName}"]`);
                            if (input && input.value.trim() !== '') {
                                subFieldData[fieldName] = input.value.trim();
                                userStartedFilling = true;
                            } else if (hasBooleanValue) {
                                // Default to empty string for text fields
                                subFieldData[fieldName] = '';
                            }
                        } else if (fieldType === 'List' || (typeof fieldType === 'string' && fieldType.startsWith('List ['))) {
                            const input = rateTab.querySelector(`select[name="${inputName}"], textarea[name="${inputName}"]`);
                            if (input && input.value.trim() !== '') {
                                subFieldData[fieldName] = input.value.trim();
                                userStartedFilling = true;
                            } else if (hasBooleanValue) {
                                subFieldData[fieldName] = '';
                            }
                        }
                    }

                    // Check if this sub-metric has its required boolean filled
                    if (hasBooleanField && hasBooleanValue) {
                        metricData[subFieldName] = subFieldData;
                        filledSubMetrics++;
                    } else if (hasBooleanField && !hasBooleanValue) {
                        // Boolean field exists but not filled
                        if (Object.keys(subFieldData).length > 0) {
                            // User started filling this sub-metric
                            hasIncompleteMetric = true;
                        }
                    } else if (!hasBooleanField && Object.keys(subFieldData).length > 0) {
                        // If no boolean field exists, include if any field is filled
                        metricData[subFieldName] = subFieldData;
                        filledSubMetrics++;
                    }
                }

                // Check if ALL sub-metrics are filled
                if (filledSubMetrics === totalSubMetrics) {
                    // All sub-metrics filled, create rating objects for ALL metrics in this group
                    camelCaseNames.forEach(camelCaseName => {
                        const ratingObj = {};
                        ratingObj[camelCaseName] = metricData;
                        ratings.push(ratingObj);
                    });
                    hasAtLeastOne = true;
                } else if (filledSubMetrics > 0) {
                    // Some but not all filled
                    hasIncompleteMetric = true;
                }
            } else {
                // Legacy metric handling for metrics without templates
                const metric = metricWithTemplate;

                if (metric.Type && metric.Type.toLowerCase() === 'boolean') {
                    const selected = rateTab.querySelector(`input[name="${primaryMetricName}"]:checked`);
                    if (selected && selected.value !== '') {
                        camelCaseNames.forEach(camelCaseName => {
                            const ratingObj = {};
                            ratingObj[camelCaseName] = selected.value === 'true';
                            ratings.push(ratingObj);
                        });
                        hasAtLeastOne = true;
                        userStartedFilling = true;
                    }
                } else if (metric.Type && metric.Type.toLowerCase() === 'count') {
                    const input = rateTab.querySelector(`input[name="${primaryMetricName}"]`);
                    if (input && input.value.trim() !== '') {
                        const countValue = parseInt(input.value);
                        if (countValue < 0) {
                            hasIncompleteMetric = true;
                        } else {
                            camelCaseNames.forEach(camelCaseName => {
                                const ratingObj = {};
                                ratingObj[camelCaseName] = countValue;
                                ratings.push(ratingObj);
                            });
                            hasAtLeastOne = true;
                        }
                        userStartedFilling = true;
                    }
                } else if (metric.Type && metric.Type.toLowerCase() === 'list') {
                    const checkboxes = rateTab.querySelectorAll(`input[name="${primaryMetricName}"]:checked`);
                    if (checkboxes.length > 0) {
                        const listValue = Array.from(checkboxes).map(cb => cb.value);
                        camelCaseNames.forEach(camelCaseName => {
                            const ratingObj = {};
                            ratingObj[camelCaseName] = listValue;
                            ratings.push(ratingObj);
                        });
                        hasAtLeastOne = true;
                        userStartedFilling = true;
                    }
                }
            }
        });

        // Show ONE appropriate error message
        if (!hasAtLeastOne) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'eval-error-message';
            errorMsg.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                <span>${userStartedFilling || hasIncompleteMetric ? 'Please fill all required places' : 'Please select at least one rating to continue'}</span>
            `;
            const actionsDiv = footer.querySelector('.eval-modal-footer-actions');
            footer.insertBefore(errorMsg, actionsDiv);
            errorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Group metrics with identical rating objects
        const groupedRatings = groupIdenticalRatings(ratings);

        // Submit to webhook
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="eval-loading"></span> Submitting...';

        const payload = {
            conversationId: currentConversationId,
            timestamp: new Date().toISOString(),
            skill: currentSkill,
            ratings: groupedRatings
        };

        try {
            const response = await sendWebhook(RATE_CONVERSATION_WEBHOOK, payload);
            const successMessage = response.description || 'Rating submitted successfully!';

            // Scroll to top of modal body
            const modalBody = rateTab.closest('.eval-modal-body');
            if (modalBody) {
                modalBody.scrollTo({ top: 0, behavior: 'smooth' });
            }

            // Show success at the top
            showAlert(rateTab, 'success', successMessage);
            submitBtn.innerHTML = 'Submit';
            submitBtn.disabled = false;

            // Refresh data
            await loadAllSheets();
        } catch (error) {
            const errorMessage = error.message || 'Failed to submit rating. Please try again.';
            showAlert(rateTab, 'error', errorMessage);
            submitBtn.innerHTML = 'Submit';
            submitBtn.disabled = false;
        }
    }

    // Group metrics for submission (same template + same skills = one row with comma-separated definitions)
    function groupMetricsForSubmission(metrics) {
        const groupMap = new Map();

        metrics.forEach(metric => {
            // Create a key from template + skills for grouping
            const groupKey = `${metric.template}|||${JSON.stringify(metric.skills)}`;

            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, []);
            }
            groupMap.get(groupKey).push(metric);
        });

        const grouped = [];

        groupMap.forEach(metricsGroup => {
            if (metricsGroup.length === 1) {
                // Single metric
                grouped.push(metricsGroup[0]);
            } else {
                // Multiple metrics with same template and skills - combine
                const definitions = metricsGroup.map(m => m.definition).join(', ');
                const descriptions = metricsGroup.map(m => m.description).join(', ');

                grouped.push({
                    definition: definitions,
                    description: descriptions,
                    template: metricsGroup[0].template,
                    enabled: "TRUE",
                    skills: metricsGroup[0].skills
                });
            }
        });

        console.log('=== Grouped Metrics for Submission ===');
        console.log('Original count:', metrics.length);
        console.log('Grouped count:', grouped.length);
        console.log('Result:', JSON.stringify(grouped, null, 2));

        return grouped;
    }

    let stagedMetrics = [];

    async function processMetrics(overlay) {
        const addTab = overlay.querySelector('#eval-add-tab');
        const previewContainer = overlay.querySelector('#eval-process-preview');
        const formsContainer = overlay.querySelector('#metric-forms-container');
        const addButtons = overlay.querySelector('#add-tab-buttons');

        stagedMetrics = [];
        const rawMetrics = [];

        for (const formId of metricForms) {
            const form = document.getElementById(formId);

            // Collect metric names and descriptions from table rows
            const metricRows = form.querySelectorAll('.metric-pair-row');
            const metricNames = [];
            const metricDescriptions = [];

            metricRows.forEach(row => {
                const name = row.querySelector('.metric-pair-name').value.trim();
                const desc = row.querySelector('.metric-pair-desc').value.trim();
                if (name) {
                    metricNames.push(name);
                    metricDescriptions.push(desc);
                }
            });

            const rawJsonInput = form.querySelector('.metric-template-json').value.trim();

            if (metricNames.length === 0) {
                showAlert(addTab, 'error', 'Please add at least one metric name');
                return;
            }
            if (!rawJsonInput) {
                showAlert(addTab, 'error', 'Please paste a JSON template');
                return;
            }

            const skillAll = form.querySelector('.skill-all').checked;
            let skills = [];
            if (skillAll) {
                skills = ['All'];
            } else {
                const checkedSkills = form.querySelectorAll('.skill-checkbox:checked');
                if (checkedSkills.length === 0) {
                    showAlert(addTab, 'error', `Please select at least one skill`);
                    return;
                }
                skills = Array.from(checkedSkills).map(cb => cb.value);
            }

            try {
                const cleanedJson = cleanJsonInput(rawJsonInput);
                const analysis = analyzeJsonStructure(cleanedJson);

                rawMetrics.push({
                    names: metricNames,
                    descriptions: metricDescriptions,
                    analysis: analysis,
                    skills: skills,
                    originalJson: cleanedJson
                });
            } catch (error) {
                showAlert(addTab, 'error', 'Invalid JSON template: ' + error.message);
                return;
            }
        }

        for (const m of rawMetrics) {
            for (const name of m.names) {
                if (metricExists(name)) {
                    showAlert(addTab, 'error', `Metric "${name}" already exists`);
                    return;
                }
            }
        }

        stagedMetrics = rawMetrics;

        formsContainer.style.display = 'none';
        if (addButtons) addButtons.style.display = 'none';
        renderProcessPreview(previewContainer);
        previewContainer.style.display = 'block';

        const submitBtn = overlay.querySelector('#eval-submit-btn');
        submitBtn.textContent = 'Submit Metric';

        const modalBody = addTab.closest('.eval-modal-body');
        if (modalBody) modalBody.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function addListItemToBuilder(container, value) {
        const item = document.createElement('div');
        item.className = 'conf-list-item';
        item.innerHTML = `
            <span>${value}</span>
            <button type="button" class="conf-list-remove">×</button>
        `;

        // Attach remove handler directly
        item.querySelector('.conf-list-remove').addEventListener('click', () => {
            item.remove();
        });

        container.appendChild(item);
    }

    function renderProcessPreview(container) {
        container.innerHTML = '';

        stagedMetrics.forEach((item, index) => {
            const isComplex = item.analysis.isComplex;
            const card = document.createElement('div');
            card.className = 'eval-metric-card';
            card.dataset.index = index;

            let content = `
                <div class="eval-metric-card-header" style="cursor: default;">
                    <div style="flex: 1;">
                        <div class="eval-metric-badge">
                            <span class="eval-badge ${isComplex ? 'eval-badge-complex' : 'eval-badge-simple'}">
                                ${isComplex ? 'Complex Nested JSON' : 'Simple Flat JSON'}
                            </span>
                        </div>
                        <h4>${item.names.join(', ')}</h4>
                    </div>
                </div>
                <div class="eval-metric-input-group">
            `;

            if (isComplex) {
                content += `
                    <div class="eval-note" style="margin-bottom: 12px; padding: 8px; background: rgba(245, 158, 11, 0.1); border-radius: 4px; font-size: 13px; color: var(--eval-warning);">
                        Complex JSON detected. Structure is read-only. Modify via the template box if needed.
                    </div>
                    <div class="eval-preview-tree">
                        ${JSON.stringify(item.analysis.structure, null, 2)}
                    </div>
                `;
            } else {
                content += `
                    <div class="eval-note" style="margin-bottom: 12px; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 4px; font-size: 13px; color: var(--eval-success);">
                        Simple JSON detected. You can modify parameters below.
                    </div>
                    <table class="eval-config-table">
                        <thead>
                            <tr>
                                <th style="width: 30%">Parameter</th>
                                <th style="width: 25%">Type</th>
                                <th style="width: 35%">Options (for List)</th>
                                <th style="width: 10%">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                for (const [key, typeStr] of Object.entries(item.analysis.structure)) {
                    const isList = typeStr.startsWith('List [');
                    const listOptions = isList ? typeStr.substring(6, typeStr.length - 1) : '';
                    const simpleType = isList ? 'List' : typeStr;

                    content += `
                        <tr data-key="${key}">
                            <td><input type="text" class="conf-key" value="${key}"></td>
                            <td>
                                <select class="conf-type">
                                    <option value="Boolean" ${simpleType === 'Boolean' ? 'selected' : ''}>Boolean</option>
                                    <option value="Text" ${simpleType === 'Text' ? 'selected' : ''}>Text</option>
                                    <option value="Count" ${simpleType === 'Count' ? 'selected' : ''}>Count</option>
                                    <option value="List" ${simpleType === 'List' ? 'selected' : ''}>List</option>
                                </select>
                            </td>
                            <td>
                                <div class="conf-list-builder" data-initial-options="${listOptions}" ${simpleType !== 'List' ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                                    <div class="conf-list-items"></div>
                                    <div class="conf-list-add-container">
                                        <input type="text" class="conf-list-input" placeholder="Type item and press Enter" ${simpleType !== 'List' ? 'disabled' : ''}>
                                        <button type="button" class="conf-list-add-btn" ${simpleType !== 'List' ? 'disabled' : ''}>+</button>
                                    </div>
                                </div>
                            </td>
                            <td style="text-align: center;">
                                <button class="eval-action-btn delete-row" title="Delete Parameter">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    `;
                }

                content += `
                        </tbody>
                    </table>
                    <button class="eval-btn eval-btn-secondary add-param-btn" style="width: 100%; padding: 8px; border-style: dashed;">
                        + Add Parameter
                    </button>
                `;
            }

            content += `</div>`;
            card.innerHTML = content;
            container.appendChild(card);

            if (!isComplex) {
                const tableBody = card.querySelector('tbody');

                // Populate initial list items from data attribute
                card.querySelectorAll('.conf-list-builder').forEach(builder => {
                    const initialOptions = builder.dataset.initialOptions;
                    if (initialOptions) {
                        const itemsContainer = builder.querySelector('.conf-list-items');
                        initialOptions.split(',').forEach(opt => {
                            const trimmed = opt.trim();
                            if (trimmed) {
                                addListItemToBuilder(itemsContainer, trimmed);
                            }
                        });
                    }
                });

                // Handle type dropdown change
                card.addEventListener('change', (e) => {
                    if (e.target.classList.contains('conf-type')) {
                        const row = e.target.closest('tr');
                        const listBuilder = row.querySelector('.conf-list-builder');
                        const listInput = row.querySelector('.conf-list-input');
                        const listAddBtn = row.querySelector('.conf-list-add-btn');

                        if (e.target.value === 'List') {
                            listBuilder.style.opacity = '1';
                            listBuilder.style.pointerEvents = 'auto';
                            if (listInput) listInput.disabled = false;
                            if (listAddBtn) listAddBtn.disabled = false;
                        } else {
                            listBuilder.style.opacity = '0.5';
                            listBuilder.style.pointerEvents = 'none';
                            if (listInput) listInput.disabled = true;
                            if (listAddBtn) listAddBtn.disabled = true;
                        }
                    }
                });

                // Handle list item addition
                card.addEventListener('click', (e) => {
                    // Add list item button
                    const addBtn = e.target.closest('.conf-list-add-btn');
                    if (addBtn && !addBtn.disabled) {
                        const row = addBtn.closest('tr');
                        const input = row.querySelector('.conf-list-input');
                        const itemsContainer = row.querySelector('.conf-list-items');

                        if (input && input.value.trim()) {
                            addListItemToBuilder(itemsContainer, input.value.trim());
                            input.value = '';
                            input.focus();
                        }
                        return;
                    }

                    // Delete parameter row
                    const deleteBtn = e.target.closest('.delete-row');
                    if (deleteBtn) {
                        deleteBtn.closest('tr').remove();
                    }
                });

                // Handle Enter key in list input
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.target.classList.contains('conf-list-input')) {
                        e.preventDefault();
                        const input = e.target;
                        const row = input.closest('tr');
                        const itemsContainer = row.querySelector('.conf-list-items');

                        if (input.value.trim()) {
                            addListItemToBuilder(itemsContainer, input.value.trim());
                            input.value = '';
                        }
                    }
                });

                card.querySelector('.add-param-btn').addEventListener('click', () => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><input type="text" class="conf-key" placeholder="Name"></td>
                        <td>
                            <select class="conf-type">
                                <option value="Boolean">Boolean</option>
                                <option value="Text" selected>Text</option>
                                <option value="Count">Count</option>
                                <option value="List">List</option>
                            </select>
                        </td>
                        <td>
                            <div class="conf-list-builder" style="opacity: 0.5; pointer-events: none;">
                                <div class="conf-list-items"></div>
                                <div class="conf-list-add-container">
                                    <input type="text" class="conf-list-input" placeholder="Type item and press Enter" disabled>
                                    <button type="button" class="conf-list-add-btn" disabled>+</button>
                                </div>
                            </div>
                        </td>
                        <td style="text-align: center;">
                            <button class="eval-action-btn delete-row" title="Delete Parameter">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        });

        const backBtn = document.createElement('button');
        backBtn.className = 'eval-btn eval-btn-secondary';
        backBtn.style.marginTop = '20px';
        backBtn.innerHTML = '← Back to Edit';
        backBtn.addEventListener('click', () => {
            document.querySelector('#metric-forms-container').style.display = 'block';
            if (document.querySelector('#add-tab-buttons')) {
                document.querySelector('#add-tab-buttons').style.display = 'flex';
            }
            container.style.display = 'none';
            const submitBtn = document.querySelector('#eval-submit-btn');
            submitBtn.textContent = 'Process Metric(s)';
        });
        container.appendChild(backBtn);
    }

    async function finalizeAndSubmitMetrics(overlay, submitBtn) {
        const previewContainer = overlay.querySelector('#eval-process-preview');
        const cards = previewContainer.querySelectorAll('.eval-metric-card');
        const metricsToAdd = [];
        const addTab = overlay.querySelector('#eval-add-tab');

        try {
            cards.forEach((card, index) => {
                const stagedItem = stagedMetrics[index];
                let finalStructure = {};

                if (stagedItem.analysis.isComplex) {
                    finalStructure = stagedItem.analysis.structure;
                } else {
                    const rows = card.querySelectorAll('tbody tr');
                    const flatStructure = {};

                    rows.forEach(row => {
                        const key = row.querySelector('.conf-key').value.trim();
                        const type = row.querySelector('.conf-type').value;

                        if (!key) return;

                        if (type === 'List') {
                            const listItems = row.querySelectorAll('.conf-list-item span');
                            const options = Array.from(listItems).map(span => span.textContent.trim()).filter(v => v);
                            if (options.length === 0) throw new Error(`List options required for "${key}"`);
                            flatStructure[key] = `List [${options.join(', ')}]`;
                        } else {
                            flatStructure[key] = type;
                        }
                    });

                    if (Object.keys(flatStructure).length === 0) {
                        throw new Error(`Metric ${stagedItem.names[0]} must have at least one parameter`);
                    }

                    finalStructure = { "General": flatStructure };
                }

                const templateStr = JSON.stringify(finalStructure);

                stagedItem.names.forEach((name, i) => {
                    metricsToAdd.push({
                        definition: name,
                        description: stagedItem.descriptions[i] || '',
                        template: templateStr,
                        enabled: "TRUE",
                        skills: stagedItem.skills
                    });
                });
            });
        } catch (e) {
            showAlert(addTab, 'error', e.message);
            return;
        }

        const groupedMetrics = groupMetricsForSubmission(metricsToAdd);

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="eval-loading"></span> Submitting...';

        const payload = {
            timestamp: new Date().toISOString(),
            metrics: groupedMetrics
        };

        try {
            const response = await sendWebhook(ADD_METRIC_WEBHOOK, payload);
            const successMessage = response.description || 'Metric(s) added successfully!';

            document.querySelector('#metric-forms-container').innerHTML = '';
            document.querySelector('#metric-forms-container').style.display = 'block';
            if (document.querySelector('#add-tab-buttons')) {
                document.querySelector('#add-tab-buttons').style.display = 'flex';
            }
            previewContainer.style.display = 'none';

            addMetricForm(document.querySelector('#eval-add-tab'));

            showAlert(addTab, 'success', successMessage);
            submitBtn.innerHTML = 'Process Metric(s)';
            submitBtn.disabled = false;

            await loadAllSheets();
        } catch (error) {
            showAlert(addTab, 'error', error.message || 'Failed to submit');
            submitBtn.innerHTML = 'Submit Metric';
            submitBtn.disabled = false;
        }
    }

    function sendWebhook(url, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'e8965ee368d80c0e9a4203cc2b327a84cb669af2fbba1aaa2e9c6d2b769abe0f'
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const responseData = JSON.parse(response.responseText);

                            // Check for success field in response
                            if (responseData.hasOwnProperty('success')) {
                                if (responseData.success === true) {
                                    resolve(responseData);
                                } else {
                                    // Success field is false
                                    const errorMessage = responseData.description || 'Operation failed';
                                    reject(new Error(errorMessage));
                                }
                            } else {
                                // No success field, assume success for backward compatibility
                                resolve(responseData);
                            }
                        } catch (parseError) {
                            // If response is not JSON or parsing fails, resolve with response
                            resolve(response);
                        }
                    } else {
                        reject(new Error(`Webhook failed with status ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    function showAlert(container, type, message) {
        const existingAlert = container.querySelector('.eval-alert');
        if (existingAlert) existingAlert.remove();

        const alert = document.createElement('div');
        alert.className = `eval-alert eval-alert-${type}`;

        const icon = type === 'success'
            ? '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';

        alert.innerHTML = `${icon}<span>${message}</span>`;
        container.insertBefore(alert, container.firstChild);

        // Auto-scroll to show the alert
        const modalBody = container.closest('.eval-modal-body');
        if (modalBody) {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (type === 'success') {
            setTimeout(() => {
                alert.style.opacity = '0';
                setTimeout(() => alert.remove(), 300);
            }, 5000);
        }
    }

    // Update button appearance based on rating status

    // Button Injection
    function injectButton() {
        console.log('[EVAL] 🔍 injectButton: Starting button injection check...');
        
        const targetButton = document.querySelector('button.source-icon');
        if (!targetButton) {
            console.warn('[EVAL] ❌ injectButton: Target button (button.source-icon) not found in DOM');
            console.log('[EVAL] 💡 Tip: The ERP may still be loading, or the page structure has changed');
            return false;
        }
        console.log('[EVAL] ✅ injectButton: Target button found:', targetButton);

        const existingButton = document.querySelector('.eval-button');
        if (existingButton) {
            console.log('[EVAL] ℹ️ injectButton: Evaluate button already exists, skipping injection');
            return true;
        }

        console.log('[EVAL] 🎨 injectButton: Creating new Evaluate button...');
        const evalButton = document.createElement('button');
        evalButton.className = 'eval-button';
        evalButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
            </svg>
            <span>Evaluate</span>
        `;
        
        evalButton.title = 'Evaluate Conversation';
        
        evalButton.addEventListener('click', async () => {
            console.log('[EVAL] 🖱️ Button clicked - Starting evaluation process...');
            
            // Check if conversation is closed before allowing evaluation
            const conversationClosedText = document.body.textContent.includes('Conversation closed');
            console.log('[EVAL] 🔒 Conversation closed status:', conversationClosedText);
            
            if (!conversationClosedText) {
                console.warn('[EVAL] ⚠️ Cannot evaluate: Conversation is still open');
                alert('⚠️ This conversation is still open.\n\nYou can only evaluate closed conversations. Please wait until the conversation is closed before rating.');
                return;
            }
            
            evalButton.disabled = true;
            console.log('[EVAL] 📊 Loading user info and sheets data...');
            getCurrentUserInfo();
            const success = await loadAllSheets();
            
            if (success) {
                console.log('[EVAL] ✅ Sheets data loaded successfully');
                checkIfAlreadyRated();
                console.log('[EVAL] 🔍 Already rated check:', isAlreadyRated);
                
                // Show confirmation if already rated
                if (isAlreadyRated) {
                    console.log('[EVAL] ⚠️ Conversation already rated - showing confirmation dialog');
                    const shouldProceed = await showConfirmDialog();
                    if (!shouldProceed) {
                        console.log('[EVAL] ❌ User cancelled re-rating');
                        evalButton.disabled = false;
                        return;
                    }
                    console.log('[EVAL] ✅ User confirmed re-rating');
                }
                
                console.log('[EVAL] 🎨 Opening evaluation modal...');
                createModal();
            } else {
                console.error('[EVAL] ❌ Failed to load sheets data');
                alert('Failed to load evaluation data. Please try again.');
            }
            
            evalButton.disabled = false;
        });

        targetButton.parentNode.insertBefore(evalButton, targetButton);
        console.log('[EVAL] ✅ Evaluate button successfully injected into DOM');
        console.log('[EVAL] 📍 Button location: Before', targetButton);
        return true;
    }

    // Initialize on conversation change
    async function initializeForConversation() {
        getCurrentUserInfo();
        
        if (currentConversationId) {
            await loadAllSheets();
            checkIfAlreadyRated();
        }
    }

    // Observer to watch for conversation changes
    const observer = new MutationObserver((mutations) => {
        // Check if button needs re-injection
        const buttonExists = document.querySelector('.eval-button');
        const targetButton = document.querySelector('button.source-icon');
        
        if (targetButton && !buttonExists) {
            injectButton();
        }

        // Check if conversation changed
        const conversationChanged = mutations.some(mutation => {
            return Array.from(mutation.addedNodes).some(node => {
                return node.classList && (
                    node.classList.contains('client-info-item') ||
                    node.querySelector && node.querySelector('.client-info-item')
                );
            });
        });

        if (conversationChanged) {
            const existingButton = document.querySelector('.eval-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            setTimeout(async () => {
                await initializeForConversation();
                injectButton();
            }, 1000);
        }
    });

    // Refresh modal content when conversation changes
    async function refreshModalContent(overlay, newConvoId) {

        const modal = overlay.querySelector('.eval-modal');
        if (!modal) return;

        // Show refresh indicator
        const refreshOverlay = document.createElement('div');
        refreshOverlay.className = 'eval-refresh-overlay';
        refreshOverlay.innerHTML = `
            <div class="eval-refresh-spinner"></div>
            <div class="eval-refresh-text">Loading new conversation...</div>
            <div class="eval-refresh-convo">${newConvoId || currentConversationId}</div>
        `;
        modal.appendChild(refreshOverlay);

        // Wait a moment for visual feedback, then reload data
        await new Promise(resolve => setTimeout(resolve, 300));

        // Reload sheets data for the new conversation
        await loadAllSheets();
        checkIfAlreadyRated();

        // Update info bar
        const infoBar = overlay.querySelector('.eval-info-bar');
        if (infoBar) {
            infoBar.innerHTML = `
                <div class="eval-info-item">
                    <span class="eval-info-label">Skill:</span>
                    <span class="eval-info-value highlight">${currentSkill || 'N/A'}</span>
                </div>
                <div class="eval-info-item">
                    <span class="eval-info-label">Conversation:</span>
                    <span class="eval-info-value">${currentConversationId || 'N/A'}</span>
                </div>
            `;
        }

        // Re-render the active tab
        const activeTab = overlay.querySelector('.eval-tab.active');
        if (activeTab) {
            const tabName = activeTab.dataset.tab;
            if (tabName === 'rate') {
                renderRateTab(overlay);
            } else if (tabName === 'view') {
                renderViewMetricsTab(overlay);
            } else if (tabName === 'add') {
                renderAddTab(overlay);
            }
        }

        // Update submit button state
        setupSubmitButton(overlay);

        // Remove refresh indicator with fade
        refreshOverlay.style.opacity = '0';
        refreshOverlay.style.transition = 'opacity 0.3s';
        setTimeout(() => refreshOverlay.remove(), 300);
    }

    // Start polling for conversation changes when modal is open
    function startConversationPolling() {
        if (conversationCheckInterval) return; // Already polling

        lastKnownConversationId = currentConversationId;

        conversationCheckInterval = setInterval(() => {
            // Only check if modal is open
            if (!activeModalOverlay || !document.body.contains(activeModalOverlay)) {
                stopConversationPolling();
                return;
            }

            // Get current conversation ID from DOM
            const convIdEl = Array.from(document.querySelectorAll('.client-info-item')).find(el =>
                el.querySelector('.key')?.innerText.trim() === 'Conversation ID'
            );
            const newConvoId = convIdEl?.querySelector('.value')?.innerText.trim() || '';

            // Also get skill
            const skillEl = Array.from(document.querySelectorAll('.client-info-item')).find(el =>
                el.querySelector('.key')?.innerText.trim() === 'Skill'
            );
            const newSkill = skillEl?.querySelector('.value')?.innerText.trim() || '';

            // Check if conversation changed
            if (newConvoId && newConvoId !== lastKnownConversationId) {
                lastKnownConversationId = newConvoId;
                currentConversationId = newConvoId;
                currentSkill = newSkill;
                refreshModalContent(activeModalOverlay, newConvoId);
            }
        }, 500); // Check every 500ms
    }

    // Stop polling when modal is closed
    function stopConversationPolling() {
        if (conversationCheckInterval) {
            clearInterval(conversationCheckInterval);
            conversationCheckInterval = null;
        }
    }

    // Diagnostic function - can be called from console
    window.chatccEvalDiagnostics = function() {
        console.log('[EVAL] 🔧 ========================================');
        console.log('[EVAL] 🔧 DIAGNOSTICS - Button Visibility Check');
        console.log('[EVAL] 🔧 ========================================');
        
        // Check URL
        console.log('[EVAL] 🌐 Current URL:', window.location.href);
        const urlMatch = window.location.href.includes('erp.maids.cc/chatcc');
        console.log('[EVAL] 🌐 URL matches expected pattern:', urlMatch ? '✅ YES' : '❌ NO');
        
        // Check target button
        const targetButton = document.querySelector('button.source-icon');
        console.log('[EVAL] 🎯 Target button (button.source-icon):', targetButton ? '✅ FOUND' : '❌ NOT FOUND');
        if (targetButton) {
            console.log('[EVAL] 📍 Target button location:', targetButton);
            console.log('[EVAL] 📍 Target button visible:', targetButton.offsetParent !== null);
        }
        
        // Check eval button
        const evalButton = document.querySelector('.eval-button');
        console.log('[EVAL] 🔘 Evaluate button (.eval-button):', evalButton ? '✅ EXISTS' : '❌ MISSING');
        if (evalButton) {
            console.log('[EVAL] 📍 Eval button location:', evalButton);
            console.log('[EVAL] 📍 Eval button visible:', evalButton.offsetParent !== null);
        }
        
        // Check user info elements
        const usernameEl = document.querySelector('.user-status-badge');
        console.log('[EVAL] 👤 Username element (.user-status-badge):', usernameEl ? '✅ FOUND' : '❌ NOT FOUND');
        if (usernameEl) {
            console.log('[EVAL] 👤 Username value:', usernameEl.innerText.trim());
        }
        
        const clientInfoItems = document.querySelectorAll('.client-info-item');
        console.log('[EVAL] 📋 Client info items found:', clientInfoItems.length);
        
        const skillEl = Array.from(clientInfoItems).find(el =>
            el.querySelector('.key')?.innerText.trim() === 'Skill'
        );
        console.log('[EVAL] 🎯 Skill element:', skillEl ? '✅ FOUND' : '❌ NOT FOUND');
        if (skillEl) {
            console.log('[EVAL] 🎯 Skill value:', skillEl.querySelector('.value')?.innerText.trim() || '(empty)');
        }
        
        const convIdEl = Array.from(clientInfoItems).find(el =>
            el.querySelector('.key')?.innerText.trim() === 'Conversation ID'
        );
        console.log('[EVAL] 💬 Conversation ID element:', convIdEl ? '✅ FOUND' : '❌ NOT FOUND');
        if (convIdEl) {
            console.log('[EVAL] 💬 Conversation ID value:', convIdEl.querySelector('.value')?.innerText.trim() || '(empty)');
        }
        
        // Check conversation state
        const isClosed = document.body.textContent.includes('Conversation closed');
        console.log('[EVAL] 🔒 Conversation closed:', isClosed ? '✅ YES' : '❌ NO (still open)');
        
        // Current state
        console.log('[EVAL] 📊 Current State Variables:');
        console.log('[EVAL] 📊   - Username:', currentUsername);
        console.log('[EVAL] 📊   - Skill:', currentSkill || '(not set)');
        console.log('[EVAL] 📊   - Conversation ID:', currentConversationId || '(not set)');
        console.log('[EVAL] 📊   - Already Rated:', isAlreadyRated);
        console.log('[EVAL] 📊   - Sheets Data Loaded:', sheetsData.metrics.length, 'metrics');
        
        // Summary
        console.log('[EVAL] 🔧 ========================================');
        console.log('[EVAL] 🔧 SUMMARY:');
        const canShow = urlMatch && targetButton && !evalButton;
        console.log('[EVAL] 🔧 Button SHOULD be visible:', canShow ? '✅ YES' : '❌ NO');
        if (!canShow) {
            console.log('[EVAL] 🔧 Reasons button might not show:');
            if (!urlMatch) console.log('[EVAL] 🔧   - Wrong URL (not on chatcc page)');
            if (!targetButton) console.log('[EVAL] 🔧   - Target button not found (page structure changed?)');
            if (evalButton) console.log('[EVAL] 🔧   - Button already exists (this is normal)');
        }
        console.log('[EVAL] 🔧 ========================================');
        
        return {
            urlMatch,
            targetButton: !!targetButton,
            evalButton: !!evalButton,
            username: currentUsername,
            skill: currentSkill,
            conversationId: currentConversationId,
            isClosed,
            alreadyRated: isAlreadyRated,
            metricsCount: sheetsData.metrics.length
        };
    };
    
    console.log('[EVAL] 💡 TIP: Run chatccEvalDiagnostics() in console to check button status');

    // Start the script
    function init() {
        let attempts = 0;
        const maxAttempts = 1000;
        
        // First, wait for the target button to be available
        const waitForTarget = setInterval(async () => {
            attempts++;
            const targetButton = document.querySelector('button.source-icon');
            
            if (targetButton || attempts >= maxAttempts) {
                clearInterval(waitForTarget);
                
                if (attempts >= maxAttempts) {
                    console.error('[EVAL] ❌ TIMEOUT: Target button (button.source-icon) not found after', maxAttempts, 'attempts');
                    return;
                }
                
                if (targetButton && !document.querySelector('.eval-button')) {
                    getCurrentUserInfo();
                    if (currentConversationId) {
                        await loadAllSheets();
                        checkIfAlreadyRated();
                    }
                    
                    if (injectButton()) {
                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });
                    }
                }
            }
        }, 1000);
    }

    // Wait for page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();