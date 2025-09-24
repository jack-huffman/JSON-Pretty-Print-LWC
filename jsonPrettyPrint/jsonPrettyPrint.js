import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class JsonPrettyPrint extends LightningElement {
    @api recordId;
    @api fieldApiName = 'Payload__c'; // Configurable property
    
    jsonTree = [];
    error = null;
    expandedNodes = new Set();
    fieldData = null;
    fieldDefinition = null;
    allExpanded = false;
    objectInfo = null;
    objectApiName = null;
    showRawFormat = false; // Toggle state for raw vs pretty format

    // Wire to get object metadata for field labels
    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            this.objectInfo = data;
            console.log('Object info received:', data);
            this.processCurrentSelection(); // Refresh display with proper labels
        } else if (error) {
            console.error('Error loading object info:', error);
            this.objectInfo = null;
        }
    }

    // Alternative approach: Use getRecord with layoutTypes to get all fields
    @wire(getRecord, { 
        recordId: '$recordId',
        layoutTypes: ['Full'],
        modes: ['View']
    })
    wiredRecord({ error, data }) {
        console.log('wiredRecord called with:', { error, data, fieldApiName: this.fieldApiName, recordId: this.recordId });
        
        if (data) {
            this.error = null;
            console.log('Record data received:', data);
            console.log('Available fields:', Object.keys(data.fields || {}));
            
            // Extract object API name for getObjectInfo wire
            if (data.apiName) {
                this.objectApiName = data.apiName;
                console.log('Object API name extracted:', this.objectApiName);
            }
            
            // Extract field data using layoutTypes approach - this gets all fields
            this.fieldData = data.fields[this.fieldApiName]?.value || null;
            console.log('Field data extracted for', this.fieldApiName, ':', this.fieldData);
            
            // If field data is still null, try alternative access methods
            if (this.fieldData === null) {
                console.log('Field data is null. Field structure:', data.fields[this.fieldApiName]);
                
                // Try accessing the field directly from the record data
                if (data.recordTypeInfo && data.recordTypeInfo.available) {
                    // For some cases, field data might be at the root level
                    this.fieldData = data[this.fieldApiName] || null;
                    console.log('Tried root level access:', this.fieldData);
                }
                
                console.log('All available field values:', Object.keys(data.fields).map(key => ({
                    field: key,
                    value: data.fields[key]?.value,
                    displayValue: data.fields[key]?.displayValue
                })));
            }
            
            // Get field definition from the record's metadata
            this.extractFieldDefinition(data);
            
            this.processCurrentSelection();
        } else if (error) {
            console.error('Error loading record:', error);
            this.error = `Failed to load field '${this.fieldApiName}': ${error.body?.message || error.message}`;
            this.jsonTree = [];
            this.fieldData = null;
        }
    }


    extractFieldDefinition(recordData) {
        // Extract field label and other metadata from the record data
        const fieldInfo = recordData.fields[this.fieldApiName];
        if (fieldInfo) {
            this.fieldDefinition = {
                label: fieldInfo.displayValue || this.fieldApiName,
                apiName: this.fieldApiName
            };
        }
    }

    get hasPayload() {
        const hasData = this.jsonTree.length > 0 && !this.error;
        console.log('hasPayload check:', { 
            jsonTreeLength: this.jsonTree.length, 
            error: this.error, 
            hasData,
            fieldData: this.fieldData
        });
        return hasData;
    }

    get currentFieldLabel() {
        // Use the field label from object metadata if available
        if (this.objectInfo?.fields && this.objectInfo.fields[this.fieldApiName]) {
            return this.objectInfo.fields[this.fieldApiName].label;
        }
        
        // Use the field definition label if available, otherwise fall back to API name
        if (this.fieldDefinition?.label) {
            return this.fieldDefinition.label;
        }
        
        // Create a user-friendly label from API name as fallback
        return this.fieldApiName?.replace(/__c$/, '').replace(/_/g, ' ') || 'JSON Field';
    }

    get expandCollapseButtonLabel() {
        return this.allExpanded ? 'Collapse All' : 'Expand All';
    }

    get expandCollapseIcon() {
        return this.allExpanded ? 'utility:collapse_all' : 'utility:expand_all';
    }

    get formatToggleIcon() {
        return this.showRawFormat ? 'utility:preview' : 'utility:text';
    }

    get formatToggleLabel() {
        return this.showRawFormat ? 'Show Pretty Format' : 'Show Raw JSON';
    }

    get formattedRawJson() {
        if (!this.fieldData) {
            return '';
        }
        try {
            const parsedJson = JSON.parse(this.fieldData);
            return JSON.stringify(parsedJson, null, 2);
        } catch (e) {
            return this.fieldData;
        }
    }

    get currentJsonData() {
        return this.fieldData;
    }


    processPayload(payload) {
        console.log('processPayload called with:', payload);
        try {
            if (!payload || payload.trim() === '' || payload === '{}') {
                console.log('No payload or empty payload, clearing jsonTree');
                this.jsonTree = [];
                return;
            }

            const parsedJson = JSON.parse(payload);
            console.log('JSON parsed successfully:', parsedJson);
            this.jsonTree = this.buildJsonTree(parsedJson, '', 0);
            console.log('JSON tree built:', this.jsonTree);
        } catch (e) {
            console.error('JSON parsing error:', e);
            this.error = `Invalid JSON: ${e.message}`;
            this.jsonTree = [];
        }
    }

    buildJsonTree(obj, parentKey = '', level = 0) {
        const result = [];
        
        if (obj === null) {
            return [{
                key: this.generateKey(parentKey, level),
                displayKey: parentKey,
                value: 'null',
                type: 'null',
                level: level,
                hasChildren: false,
                isExpanded: false,
                children: []
            }];
        }

        if (typeof obj !== 'object') {
            return [{
                key: this.generateKey(parentKey, level),
                displayKey: parentKey,
                value: this.formatValue(obj),
                type: typeof obj,
                level: level,
                hasChildren: false,
                isExpanded: false,
                children: []
            }];
        }

        const isArray = Array.isArray(obj);
        const entries = isArray ? obj.map((item, index) => [index, item]) : Object.entries(obj);

        entries.forEach(([key, value]) => {
            const fullPath = parentKey ? `${parentKey}.${key}` : key;
            const nodeKey = this.generateKey(fullPath, level);
            const hasChildren = this.hasChildren(value);
            const isExpanded = this.expandedNodes.has(nodeKey);

            const node = {
                key: nodeKey,
                displayKey: key,
                value: hasChildren ? (isArray ? `[${obj.length} items]` : `{${Object.keys(value).length} properties}`) : this.formatValue(value),
                type: this.getValueType(value),
                level: level,
                hasChildren: hasChildren,
                isExpanded: isExpanded,
                isArray: Array.isArray(value),
                children: []
            };

            if (hasChildren && isExpanded) {
                node.children = this.buildJsonTree(value, fullPath, level + 1);
            }

            result.push(node);
        });

        return result;
    }

    hasChildren(value) {
        return value !== null && typeof value === 'object' && 
               (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);
    }

    getValueType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    formatValue(value) {
        if (typeof value === 'string') {
            return `"${value}"`;
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        if (value === null) {
            return 'null';
        }
        return JSON.stringify(value);
    }

    generateKey(path, level) {
        // Use a deterministic key based on path and level only
        return `${path}_${level}`;
    }

    handleToggleExpansion(event) {
        const nodeKey = event.detail.nodeKey;
        console.log('Toggle expansion for node:', nodeKey);
        console.log('Current expanded nodes before toggle:', this.expandedNodes);
        
        if (this.expandedNodes.has(nodeKey)) {
            this.expandedNodes.delete(nodeKey);
            console.log('Collapsed node:', nodeKey);
        } else {
            this.expandedNodes.add(nodeKey);
            console.log('Expanded node:', nodeKey);
        }

        // Update allExpanded state based on current expansion
        this.updateAllExpandedState();
        
        console.log('Expanded nodes after toggle:', this.expandedNodes);
        
        // Rebuild the tree to reflect the expansion state
        this.rebuildTree();
    }

    updateAllExpandedState() {
        // Check if all expandable nodes are currently expanded
        if (this.expandedNodes.size === 0) {
            this.allExpanded = false;
        } else {
            // We'll update this logic later if needed
            this.allExpanded = false; // For now, assume not all expanded after manual toggle
        }
    }

    rebuildTree() {
        // Rebuild tree based on current selection
        this.processCurrentSelection();
    }

    processCurrentSelection() {
        this.processPayload(this.fieldData);
    }


    handleExpandCollapseAll() {
        console.log('Expand/Collapse All button clicked, allExpanded:', this.allExpanded);
        console.log('Current expanded nodes:', this.expandedNodes);
        
        if (this.allExpanded) {
            // Collapse all
            this.expandedNodes.clear();
            this.allExpanded = false;
            console.log('Collapsed all nodes');
        } else {
            // Expand all
            this.expandAllNodes();
            this.allExpanded = true;
            console.log('Expanded all nodes, new expanded nodes:', this.expandedNodes);
        }
        this.processCurrentSelection();
    }

    expandAllNodes() {
        const selectedData = this.currentJsonData;
        if (!selectedData) return;

        try {
            const parsedJson = JSON.parse(selectedData);
            this.addAllNodesToExpanded(parsedJson, '', 0);
        } catch (e) {
            // If JSON is invalid, don't expand anything
        }
    }

    addAllNodesToExpanded(obj, parentKey = '', level = 0) {
        if (obj === null || typeof obj !== 'object') {
            return;
        }

        const isArray = Array.isArray(obj);
        const entries = isArray ? obj.map((item, index) => [index, item]) : Object.entries(obj);

        entries.forEach(([key, value]) => {
            const fullPath = parentKey ? `${parentKey}.${key}` : key;
            const nodeKey = this.generateKey(fullPath, level);
            
            if (this.hasChildren(value)) {
                this.expandedNodes.add(nodeKey);
                this.addAllNodesToExpanded(value, fullPath, level + 1);
            }
        });
    }

    async handleCopyToClipboard() {
        console.log('Copy button clicked');
        const jsonData = this.currentJsonData;
        console.log('JSON data to copy:', jsonData);
        
        if (!jsonData || jsonData.trim() === '' || jsonData === '{}') {
            this.showToast('No data to copy', 'The selected field is empty.', 'warning');
            return;
        }

        // Prepare the formatted JSON
        let textToCopy;
        try {
            const parsedJson = JSON.parse(jsonData);
            textToCopy = JSON.stringify(parsedJson, null, 2);
        } catch (e) {
            console.error('JSON parsing failed, using raw data:', e);
            textToCopy = jsonData;
        }

        // Try modern Clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(textToCopy);
                this.showToast('Copied!', 'JSON data copied to clipboard successfully.', 'success');
                return;
            } catch (clipboardError) {
                console.error('Modern clipboard API failed:', clipboardError);
                // Fall through to legacy method
            }
        }

        // Fallback to legacy method for Firefox and other browsers
        try {
            this.copyToClipboardLegacy(textToCopy);
            this.showToast('Copied!', 'JSON data copied to clipboard successfully.', 'success');
        } catch (legacyError) {
            console.error('Legacy clipboard method failed:', legacyError);
            this.showToast('Copy Failed', 'Unable to copy data to clipboard. Please manually select and copy the text.', 'error');
        }
    }

    copyToClipboardLegacy(text) {
        // Create a temporary textarea element
        const textArea = document.createElement('textarea');
        textArea.value = text;
        
        // Make it invisible but not display:none (which would make it unselectable)
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        
        // Add to DOM, select, copy, and remove
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        // Use the older execCommand API
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!successful) {
            throw new Error('execCommand copy failed');
        }
    }

    handleFormatToggle() {
        console.log('Format toggle clicked, current showRawFormat:', this.showRawFormat);
        this.showRawFormat = !this.showRawFormat;
        console.log('Format toggled to:', this.showRawFormat);
    }

    showToast(title, message, variant) {
        // Create a simple toast-like notification
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: 'dismissable'
        });
        this.dispatchEvent(event);
    }
}
