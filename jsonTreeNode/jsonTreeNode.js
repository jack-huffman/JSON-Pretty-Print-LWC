import { LightningElement, api } from 'lwc';

export default class JsonTreeNode extends LightningElement {
    @api node;
    @api level;

    get nodeClasses() {
        return `json-node level-${this.level}`;
    }

    get nodeContentClasses() {
        let classes = 'node-content';
        if (this.node.hasChildren) {
            classes += ' expandable';
        }
        return classes;
    }


    get expandIcon() {
        return this.node.isExpanded ? 'utility:chevrondown' : 'utility:chevronright';
    }

    get showChildren() {
        return this.node.hasChildren && this.node.isExpanded && this.node.children.length > 0;
    }

    get keyClasses() {
        let classes = 'json-key';
        if (this.node.isArray) {
            classes += ' array-key';
        }
        return classes;
    }

    get valueClasses() {
        let classes = 'json-value';
        
        switch (this.node.type) {
            case 'string':
                classes += ' string-value';
                break;
            case 'number':
                classes += ' number-value';
                break;
            case 'boolean':
                classes += ' boolean-value';
                break;
            case 'null':
                classes += ' null-value';
                break;
            case 'object':
                classes += ' object-value';
                break;
            case 'array':
                classes += ' array-value';
                break;
            default:
                classes += ' default-value';
        }
        
        return classes;
    }

    handleToggle(event) {
        event.stopPropagation();
        
        if (this.node.hasChildren) {
            // Dispatch custom event to parent
            const toggleEvent = new CustomEvent('togglenodeexpansion', {
                detail: {
                    nodeKey: this.node.key
                },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(toggleEvent);
        }
    }

    handleChildToggle(event) {
        // Bubble up the event to the parent
        event.stopPropagation();
        const toggleEvent = new CustomEvent('togglenodeexpansion', {
            detail: event.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(toggleEvent);
    }
}
