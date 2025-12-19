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
- **Search Bar**: Filter metrics by name
- **Toolbar**: Expand All/Collapse All/Show Unrated controls
- **Collapsible Metrics**: Main metric cards start collapsed by default
- **Collapsible Sub-Metrics**: Template-based sub-metrics (like "Request_Service") have their own collapse/expand functionality

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

## 🐛 Troubleshooting

### Button Not Showing?

If the "Evaluate" button doesn't appear, the script now includes comprehensive logging to help diagnose the issue:

1. **Open Browser Console** (F12 or Right-click > Inspect > Console)
2. **Look for `[EVAL]` prefixed messages** - these show the initialization process
3. **Run diagnostics**: Type `chatccEvalDiagnostics()` in the console and press Enter

The diagnostics will show:
- ✅/❌ Whether the target button is found
- ✅/❌ Whether you're on the correct URL
- ✅/❌ Current conversation data (ID, Skill, Username)
- ✅/❌ Whether the conversation is closed
- ✅/❌ Whether sheets data loaded successfully

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Target button not found | ERP structure changed or page still loading | Wait a few seconds, refresh page, or check if `.source-icon` element exists |
| Wrong URL | Not on ChatCC page | Navigate to `https://erp.maids.cc/chatcc*` |
| No Conversation ID | On inbox/list page | Open a specific conversation |
| Button exists but disabled | Conversation is open | Wait for conversation to close |

### Log Levels

The script uses emoji prefixes for easy scanning:
- 🚀 **Initialization** - Script startup
- 🔍 **Detection** - Finding elements
- ✅ **Success** - Operation completed
- ❌ **Error** - Something failed
- ⚠️ **Warning** - Attention needed
- 💡 **Tip** - Helpful information
- 🔧 **Diagnostics** - Troubleshooting info

## 📝 Recent Updates

### Latest Changes (v1.6.4)
- ✅ **Improved Add Metric tab UX/UI**
- ✅ Added step-by-step wizard feel with numbered steps (1, 2, 3)
- ✅ Better visual hierarchy with color-coded sections
- ✅ Enhanced table styling with better borders and hover effects
- ✅ Improved JSON textarea - dashed border, monospace font, better feedback
- ✅ Added collapsible example JSON template in help text
- ✅ Better spacing and section separators
- ✅ Enhanced action buttons with icons and clearer styling
- ✅ More informative help text for each step

### Previous Updates (v1.6.3)
- ✅ Changed metric counting to count cards instead of individual metrics
- ✅ Grouped metrics now show as single card: "Metric 1/2" instead of "Metrics (1-2)/3"
- ✅ More intuitive numbering - each card = one item

### Previous Updates (v1.6.2)
- ✅ Added logging to validation logic for debugging
- ✅ Fixed `hasUserModifiedAnyInput()` to only detect "True" selections (not default "False")

### Earlier Updates (v1.6.1)
- ✅ **Reverted to default values approach** - Boolean defaults to False, Count to 0, Text to blank
- ✅ **Added confirmation modal** - Warns user when submitting without changing any values
- ✅ Modal explains what defaults will be submitted (False/0/Blank)
- ✅ User must explicitly confirm or cancel
- ✅ Submit button always enabled (validation happens on click)

### Previous Updates (v1.5.9)
- ✅ Fixed Boolean fields being prefilled with "False" by default
- ✅ Now requires user interaction to rate - prevents accidental empty submissions
- ✅ Submit button properly validates that at least one metric is actually rated

### Previous Updates (v1.5.8)
- ✅ Removed excessive console logging (161 lines removed)
- ✅ Kept only critical error logs and diagnostic function
- ✅ Improved performance by reducing console spam

### Previous Updates (v1.5.7)
- ✅ Fixed search icon vertical alignment in search bar

### Previous Updates (v1.5.6)
- ✅ Updated theme colors to match ChatCC ERP blue-toned interface
- ✅ Changed background colors from neutral gray to dark navy-blue
- ✅ Better visual consistency with the main platform

### Previous Updates (v1.5.5)
- ✅ Removed progress bar for cleaner interface
- ✅ Metric cards now collapsed by default in both Rate and View Metrics tabs
- ✅ Added collapsible sub-metrics with dropdown functionality
- ✅ Sub-metrics (like "Request_Service") now have clickable headers with expand/collapse icons
- ✅ All sub-metrics start collapsed by default for better organization
- ✅ Expand All/Collapse All toolbar buttons now work with sub-metrics too
- ✅ Improved UI hierarchy and reduced visual clutter

### Previous Updates (v1.5.4)
- ✅ Added comprehensive logging system with `[EVAL]` prefix
- ✅ Created `chatccEvalDiagnostics()` console function for debugging
- ✅ Enhanced all initialization steps with detailed status logging
- ✅ Added DOM element detection logging
- ✅ Improved error messages with actionable tips

### Earlier Updates (v1.5.3)
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

**Version**: 1.6.4  
**Last Updated**: December 2025  
**Platform**: ChatCC ERP - MAIDS.CC

