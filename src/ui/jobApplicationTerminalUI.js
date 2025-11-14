const JOB_LISTING_POOL = [
  { title: 'Mid-level Manager', requirement: "Master's degree required", pay: '$10/hour' },
  { title: 'Assistant Data Analyst', requirement: "Bachelor's degree required", pay: '$11/hour' },
  { title: 'Adjunct Instructor', requirement: 'MFA required', pay: '$3,000/course, no benefits' },
  { title: 'Night Shift Call Center Lead', requirement: 'Experience with irate callers', pay: '$12/hour' },
  { title: 'Freelance PowerPoint Polisher', requirement: 'Weekend availability', pay: '$80/deck' },
  { title: 'Grant Application Ghostwriter', requirement: 'Non-profit experience', pay: '$15/hour' },
  { title: 'Contract QA Tester', requirement: 'Own your hardware', pay: '$9/hour' },
  { title: 'Adjunct Ethics Lecturer', requirement: 'Tenure track not available', pay: '$2,500/course' },
  { title: 'Social Media Moderator', requirement: 'Exposure to graphic content', pay: '$13/hour' },
  { title: 'Intern Supervisor', requirement: 'Must provide own snacks', pay: '$14/hour' },
  { title: 'Corporate Escape Room Designer', requirement: 'MBA preferred', pay: '$200/session' },
  { title: 'Spreadsheet Archivist', requirement: 'Excel macros wizardry', pay: '$10/hour' },
  { title: 'Part-Time Compliance Coach', requirement: 'Weekend travel', pay: '$18/hour' },
  { title: 'Influencer Outreach Associate', requirement: 'Cold emailing experience', pay: '$11/hour' },
  { title: 'Office Plant Watering Consultant', requirement: 'Must love succulents', pay: '$7/hour' }
];

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function randomId() {
  return Math.random().toString(36).slice(2);
}

export class JobApplicationTerminalUI {
  constructor(options = {}) {
    this.options = options;
    this.requiredApplications = options.requiredApplications ?? 35;
    this.visibleListingCount = options.visibleListingCount ?? 12;

    this.root = createElement('div', 'job-terminal-ui');
    this.titleEl = createElement('h2', 'job-terminal-ui__title', 'Contract Board');
    this.countEl = createElement('div', 'job-terminal-ui__count');
    this.listEl = createElement('div', 'job-terminal-ui__list');
    this.closeButton = createElement('button', 'job-terminal-ui__close', 'Close');
    this.closeButton.addEventListener('click', () => this.close());

    const container = createElement('div', 'job-terminal-ui__container');
    container.append(this.titleEl, this.countEl, this.listEl, this.closeButton);
    this.root.append(container);

    (options.parent ?? document.body).appendChild(this.root);
    this.root.style.display = 'none';

    this.listings = [];
    this.appliedCount = 0;
    this.isOpenFlag = false;

    this.refreshListings();
    this.updateProgress();
  }

  get applied() {
    return this.appliedCount;
  }

  setAppliedCount(value) {
    this.appliedCount = value;
    this.updateProgress();
  }

  open(existingListings) {
    this.isOpenFlag = true;
    this.root.style.display = 'block';
    document.body.classList.add('job-terminal-ui--open');

    if (existingListings && existingListings.length > 0) {
      this.listings = existingListings;
    }

    this.listings = this.listings.filter((item) => !item.applied);
    this.topUpListings();
    this.renderListings();
  }

  close() {
    if (!this.isOpenFlag) return;
    this.isOpenFlag = false;
    this.root.style.display = 'none';
    document.body.classList.remove('job-terminal-ui--open');
    this.options.onClose?.();
  }

  isOpen() {
    return this.isOpenFlag;
  }

  getListings() {
    return this.listings;
  }

  refreshListings() {
    this.listings = [];
    this.topUpListings();
    this.renderListings();
  }

  topUpListings() {
    const target = Math.min(
      this.visibleListingCount,
      Math.max(0, this.requiredApplications - this.appliedCount)
    );

    while (this.listings.length < target) {
      const item = JOB_LISTING_POOL[Math.floor(Math.random() * JOB_LISTING_POOL.length)];
      this.listings.push({
        id: randomId(),
        title: item.title,
        requirement: item.requirement,
        pay: item.pay,
        applied: false
      });
    }
  }

  renderListings() {
    this.listEl.innerHTML = '';
    this.listings.forEach((listing) => {
      const card = createElement('div', 'job-terminal-ui__listing');
      const title = createElement('h3', 'job-terminal-ui__listing-title', `Apply here: ${listing.title}`);
      const req = createElement('p', 'job-terminal-ui__listing-req', listing.requirement);
      const pay = createElement('p', 'job-terminal-ui__listing-pay', listing.pay);
      const button = createElement('button', 'job-terminal-ui__apply-button', listing.applied ? 'Applied' : 'Apply');
      button.disabled = listing.applied;
      button.addEventListener('click', () => this.applyToListing(listing, button));
      card.append(title, req, pay, button);
      this.listEl.appendChild(card);
    });
  }

  applyToListing(listing, button) {
    if (listing.applied) return;
    listing.applied = true;
    button.disabled = true;
    button.textContent = 'Applied';
    this.appliedCount += 1;
    this.options.onApply?.(listing);
    this.updateProgress();

    if (this.appliedCount >= this.requiredApplications) {
      this.options.onComplete?.();
      this.listings = [];
      this.renderListings();
      return;
    }

    this.listings = this.listings.filter((item) => !item.applied);
    this.topUpListings();
    this.renderListings();
  }

  updateProgress() {
    this.countEl.textContent = `Applications submitted: ${this.appliedCount} / ${this.requiredApplications}`;
  }

  destroy() {
    this.close();
    if (this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }
}
