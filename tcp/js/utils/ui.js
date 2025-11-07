// UI utility functions for managing sections and subsections

import { sectionState } from '../data/state.js';

export function toggleSection(streamName) {
  const content = document.getElementById(`content-${streamName}`);
  const icon = document.getElementById(`icon-${streamName}`);
  
  if (!content || !icon) return;
  
  const isHidden = content.style.display === 'none';
  
  if (isHidden) {
    content.style.display = '';
    icon.style.transform = 'rotate(0deg)';
    // Update state: now expanded
    sectionState.sections[streamName] = true;
  } else {
    content.style.display = 'none';
    icon.style.transform = 'rotate(-90deg)';
    // Update state: now collapsed
    sectionState.sections[streamName] = false;
  }
}

export function toggleSubsection(subsectionId) {
  const content = document.getElementById(`content-${subsectionId}`);
  const icon = document.getElementById(`icon-${subsectionId}`);
  
  if (!content || !icon) return;
  
  const isHidden = content.style.display === 'none';
  
  if (isHidden) {
    content.style.display = '';
    icon.style.transform = 'rotate(0deg)';
    // Update state: now expanded
    sectionState.subsections[subsectionId] = true;
  } else {
    content.style.display = 'none';
    icon.style.transform = 'rotate(-90deg)';
    // Update state: now collapsed
    sectionState.subsections[subsectionId] = false;
  }
}

// Restore section/subsection state after content update
export function restoreSectionState(streamName) {
  if (sectionState.sections[streamName] === false) {
    const content = document.getElementById(`content-${streamName}`);
    const icon = document.getElementById(`icon-${streamName}`);
    if (content && icon) {
      content.style.display = 'none';
      icon.style.transform = 'rotate(-90deg)';
    }
  }
}

export function restoreSubsectionState(subsectionId) {
  if (sectionState.subsections[subsectionId] === false) {
    const content = document.getElementById(`content-${subsectionId}`);
    const icon = document.getElementById(`icon-${subsectionId}`);
    if (content && icon) {
      content.style.display = 'none';
      icon.style.transform = 'rotate(-90deg)';
    }
  }
}

export function createStreamSection(streamName) {
  try {
    const section = document.createElement('div');
    section.className = 'stream-section';
    section.id = `stream-${streamName}`;

    // Sanitize stream name for HTML
    const displayName = String(streamName).charAt(0).toUpperCase() + String(streamName).slice(1);
    const sanitizedName = displayName.replace(/[<>]/g, '');

    // Create different content based on stream type
    let contentHtml = '';
    if (streamName === 'log') {
      // Messages container for logs (streaming text) - keep scrolling for logs
      contentHtml = `<div class="max-h-96 overflow-y-auto bg-slate-900 rounded-md p-4 font-mono text-sm border border-slate-700 custom-scrollbar" id="messages-${streamName}"></div>`;
    } else {
      // Create table container for structured data streams - no height restriction, scales to content
      contentHtml = `<div class="w-full" id="table-${streamName}"></div>`;
    }

    section.innerHTML = `
      <div class="bg-slate-800 rounded-lg border border-slate-700 shadow-lg card-glow">
        <div class="flex items-center justify-between p-6 pb-4 border-b border-slate-700">
          <div class="flex items-center space-x-2 cursor-pointer hover:text-slate-100 transition-colors flex-1" onclick="window.toggleSection('${streamName}')">
            <svg class="w-5 h-5 text-slate-400 transition-transform transform" id="icon-${streamName}" style="transform: rotate(0deg);">
              <path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>
            </svg>
            <h3 class="text-lg font-semibold text-slate-200">${sanitizedName}</h3>
          </div>
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600" id="status-${streamName}">
              Disconnected
            </span>
          </div>
        </div>
        <div class="p-6" id="content-${streamName}">
          ${contentHtml}
        </div>
      </div>
    `;

    return section;
  } catch (error) {
    console.error(`Error creating stream section for ${streamName}:`, error);
    // Return a minimal error section
    const errorSection = document.createElement('div');
    errorSection.className = 'stream-section';
    errorSection.innerHTML = `
      <div class="bg-slate-800 rounded-lg border border-red-700 shadow-lg card-glow">
        <div class="flex items-center justify-between p-6 pb-4 border-b border-red-700">
          <div class="flex items-center space-x-2">
            <h3 class="text-lg font-semibold text-red-300">Error</h3>
          </div>
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-300 border border-red-700">
              Error
            </span>
          </div>
        </div>
        <div class="p-6">
          <div class="text-red-200">Failed to create stream section</div>
        </div>
      </div>
    `;
    return errorSection;
  }
}

export function updateStatus(streamName, status, message = '') {
  try {
    const statusEl = document.getElementById(`status-${streamName}`);
    if (!statusEl) {
      return;
    }

    // Remove existing status classes and add new ones
    statusEl.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

    let statusText = message || status.charAt(0).toUpperCase() + status.slice(1);

    switch (status) {
      case 'connecting':
        statusEl.className += ' bg-yellow-100 text-yellow-800';
        break;
      case 'connected':
        statusEl.className += ' bg-green-100 text-green-800';
        break;
      case 'error':
        statusEl.className += ' bg-red-100 text-red-800';
        break;
      case 'disconnected':
      default:
        statusEl.className += ' bg-gray-100 text-gray-800';
        break;
    }

    statusEl.textContent = statusText;
  } catch (error) {
    console.error(`updateStatus: Error updating status for stream ${streamName}:`, error);
  }
}

