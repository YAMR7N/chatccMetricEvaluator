# ChatCC Conversation Evaluator

A comprehensive Tampermonkey userscript that integrates quality assurance tools directly into the ChatCC ERP interface for evaluating customer support conversations.

## 🎯 Purpose

This tool streamlines the evaluation process by allowing evaluators to rate and analyze customer support conversations directly within the ChatCC platform. It centralizes the evaluation workflow by:
- Fetching evaluation criteria from Google Sheets
- Providing real-time rating capabilities within the ERP
- Syncing results back to external databases via automated webhooks (n8n)

## ✨ Features

### 1. **Dynamic Metric System**
- Fetches evaluation metrics from Google Sheets in real-time
- Supports skill-based metric configurations (SA, FTR, etc.)
- Template-based and legacy metric types
- Boolean, Count, List, and nested template structures

### 2. **Intelligent UI Integration**
- Seamlessly injects "Evaluate" button into the ERP interface
- Auto-detects conversation changes with polling mechanism
- Resizable side panel with modern dark theme
- Responsive design matching ChatCC's aesthetic

### 3. **Three Main Tabs**

#### Rate Tab
- Rate conversations against predefined metrics
- Progress tracking (X/Y metrics completed)
- Search and filter capabilities
- Collapsible metric cards
- Keyboard navigation support
- Auto-validation on submission

#### View Metrics Tab
- Browse all available metrics for current skill
- Edit metric configurations (admin only)
- Search and filter functionality
- Template preview

#### Add Metric Tab
- Create new evaluation criteria
- JSON structure analyzer
- Multi-step metric builder wizard
- Bulk metric creation support

### 4. **Smart Features**
- **Conversation Eligibility Check**: Only allows evaluation of closed conversations
- **Duplicate Detection**: Warns when re-rating a conversation
- **Auto-Refresh**: Detects conversation changes and updates panel automatically
- **Progress Indicators**: Visual feedback on completion status
- **Error Handling**: Comprehensive validation and user-friendly error messages

## 🚀 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click on the Tampermonkey icon and select "Create a new script"
3. Copy the contents of `evals_chatcc_rating.user.js`
4. Paste into the Tampermonkey editor
5. Save (Ctrl/Cmd + S)
6. Navigate to `https://erp.maids.cc/chatcc*` to see the script in action

## 📋 Requirements

### System Requirements
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Tampermonkey extension
- Access to ChatCC ERP (`https://erp.maids.cc/chatcc*`)

### Permissions Required
- `GM_xmlhttpRequest` - For webhook and Google Sheets communication
- `GM_addStyle` - For injecting custom CSS
- Connection to:
  - `docs.google.com` - Fetch metrics data
  - `n8n-staging.teljoy.io` - Add metric webhook
  - `chadykarimfarah-manouella.app.n8n.cloud` - Rating submission webhook

## 🔧 Configuration

The script uses the following configuration:

```javascript
const SHEET_ID = '1ABDpeyU3FGEdvd9vHHrln-hVX83NwCfA7fsqqDaXPVY';
const ADD_METRIC_WEBHOOK = 'https://n8n-staging.teljoy.io/webhook/add-eval-metric';
const RATE_CONVERSATION_WEBHOOK = 'https://chadykarimfarah-manouella.app.n8n.cloud/webhook/add-eval-rating';
```

## 📊 Data Flow

1. **Initialization**: Script loads and waits for page elements
2. **Data Fetch**: Retrieves metrics from Google Sheets
3. **User Action**: Evaluator clicks "Evaluate" button
4. **Validation**: Checks if conversation is closed
5. **Rating**: Evaluator fills out metric ratings
6. **Submission**: Data sent to webhook endpoint
7. **Sync**: Results stored in master tracking sheets

## 🎨 UI Components

### Main Components
- **Evaluate Button**: Injected next to the source icon in the header
- **Side Panel**: Resizable modal (480px default width)
- **Info Bar**: Displays current skill and conversation ID
- **Tab Navigation**: Switch between Rate/View/Add tabs
- **Progress Bar**: Visual indicator of completion status
- **Search Bar**: Filter metrics by name
- **Toolbar**: Expand/Collapse/Filter controls

### Keyboard Shortcuts
- `Esc` - Close panel
- `Tab` - Navigate between fields
- Arrow keys - Navigate metric cards

## 🔒 Eligibility Rules

A conversation is eligible for evaluation if:
1. ✅ **Closed Status**: Must show "Conversation closed" text
2. ✅ **Metadata Present**: Has valid Conversation ID and Skill
3. ℹ️ **Re-evaluation**: Can be re-rated with confirmation prompt

## 🛠️ Technical Architecture

### Key Functions
- `loadAllSheets()` - Fetches data from Google Sheets
- `createModal()` - Builds the evaluation panel
- `renderRateTab()` - Generates rating interface
- `handleRateSubmit()` - Processes and submits ratings
- `startConversationPolling()` - Monitors conversation changes
- `sendWebhook()` - Handles external API communication

### Template System
Metrics can use structured templates:
```json
{
  "SubMetric1": {
    "fieldName": "Boolean",
    "count": "Count",
    "notes": "Text"
  }
}
```

## 📝 Recent Updates

### Latest Changes (Current Version)
- ✅ Removed redundant yellow warning card ("Rate at least one metric to submit")
- ✅ Simplified validation flow - now only shows error on submission
- ✅ Improved user experience by reducing visual clutter

## 🤝 Contributing

This is an internal tool for the ChatCC team. For suggestions or bug reports, please contact the development team.

## 📄 License

Internal use only - MAIDS.CC

## 👥 Authors

- **ChatCC Team** - Initial development and maintenance

---

**Version**: 1.5.3  
**Last Updated**: December 2025  
**Platform**: ChatCC ERP - MAIDS.CC

